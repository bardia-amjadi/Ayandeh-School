import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Param, Post, Headers } from '@nestjs/common';
import { IsDateString, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';
import { D, chargeBalance, splitInstallments } from './money';

class CreateItemDto {
  @IsString() title: string; @IsOptional() @IsString() description?: string;
  @IsNumberString({ no_symbols: true }) amount: string; @IsUUID() academicYearId: string;
  @IsOptional() @IsDateString() dueDate?: string; @IsOptional() @IsInt() @Min(1) @Max(24) installments?: number;
}
class AssignDto { @IsUUID() studentId: string; @IsOptional() @IsNumberString({ no_symbols: true }) discount?: string; @IsOptional() @IsString() discountNote?: string; }
class PaymentDto {
  @IsNumberString({ no_symbols: true }) amount: string; @IsDateString() paidAt: string;
  @IsString() method: string; @IsOptional() @IsString() reference?: string;
}

@Controller('finance')
export class FinanceController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('items') @RequirePermission('finance.view')
  items() { return this.prisma.financialItem.findMany({ where: { archived: false }, include: { academicYear: { select: { title: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }); }

  @Post('items') @RequirePermission('finance.manage')
  async createItem(@Body() dto: CreateItemDto, @CurrentUser() u: AuthUser) {
    const item = await this.prisma.financialItem.create({ data: { ...dto, amount: D(dto.amount), dueDate: dto.dueDate ? new Date(dto.dueDate) : null } });
    await this.audit.log(u.id, 'finance.item_create', 'FinancialItem', item.id, { amount: dto.amount });
    return item;
  }

  @Post('items/:itemId/assign') @RequirePermission('finance.manage')
  async assign(@Param('itemId') itemId: string, @Body() dto: AssignDto, @CurrentUser() u: AuthUser) {
    const item = await this.prisma.financialItem.findUniqueOrThrow({ where: { id: itemId } });
    const discount = D(dto.discount ?? '0');
    if (discount.gt(item.amount)) throw new BadRequestException('تخفیف از مبلغ بیشتر است');
    const base = item.dueDate ?? new Date();
    const charge = await this.prisma.$transaction(async tx => {
      const c = await tx.studentCharge.create({ data: { studentId: dto.studentId, itemId, amount: item.amount, discount, discountNote: dto.discountNote } });
      const parts = splitInstallments(item.amount.minus(discount), item.installments);
      await tx.installment.createMany({ data: parts.map((amount, i) => {
        const due = new Date(base); due.setMonth(due.getMonth() + i);
        return { chargeId: c.id, seq: i + 1, amount, dueDate: due };
      }) });
      return c;
    }).catch(e => { if (e.code === 'P2002') throw new ConflictException('این آیتم قبلاً به دانش‌آموز اختصاص یافته'); throw e; });
    await this.audit.log(u.id, 'finance.assign', 'StudentCharge', charge.id, { studentId: dto.studentId, discount: dto.discount });
    return charge;
  }

  // Idempotency-Key header is mandatory: a double-click / retry cannot create a duplicate payment.
  @Post('charges/:chargeId/payments') @RequirePermission('finance.manage')
  async pay(@Param('chargeId') chargeId: string, @Body() dto: PaymentDto, @Headers('idempotency-key') key: string | undefined, @CurrentUser() u: AuthUser) {
    if (!key || key.length < 8 || key.length > 100) throw new BadRequestException('هدر Idempotency-Key الزامی است');
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
    if (existing) { if (existing.chargeId !== chargeId || !existing.amount.equals(D(dto.amount))) throw new ConflictException('کلید تکراری با درخواست متفاوت'); return existing; }
    const amount = D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('مبلغ باید مثبت باشد');
    return this.prisma.$transaction(async tx => {
      // lock the charge row so concurrent payments can't both pass the overpayment check
      await tx.$queryRaw`SELECT id FROM "StudentCharge" WHERE id = ${chargeId} FOR UPDATE`;
      const c = await tx.studentCharge.findUniqueOrThrow({ where: { id: chargeId }, include: { payments: true } });
      const { remaining } = chargeBalance(c);
      if (amount.gt(remaining)) throw new BadRequestException('مبلغ پرداخت از مانده بیشتر است');
      const p = await tx.payment.create({ data: { chargeId, studentId: c.studentId, amount, paidAt: new Date(dto.paidAt), method: dto.method, reference: dto.reference, idempotencyKey: key, recordedById: u.id } });
      await this.audit.log(u.id, 'finance.payment', 'Payment', p.id, { amount: dto.amount, method: dto.method });
      return p;
    });
  }

  @Post('payments/:id/void') @RequirePermission('finance.manage')
  async voidPayment(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() u: AuthUser) {
    if (!body?.reason) throw new BadRequestException('دلیل ابطال الزامی است');
    const p = await this.prisma.payment.update({ where: { id }, data: { voidedAt: new Date(), voidReason: body.reason } });
    await this.audit.log(u.id, 'finance.payment_void', 'Payment', id, { reason: body.reason });
    return p;
  }

  // Student: strictly own data.
  @Get('mine')
  async mine(@CurrentUser() u: AuthUser) {
    if (u.role !== 'STUDENT') throw new ForbiddenException();
    const charges = await this.prisma.studentCharge.findMany({
      where: { studentId: u.id, voidedAt: null },
      include: { item: { select: { title: true, description: true } }, installments: { orderBy: { seq: 'asc' } }, payments: { where: { voidedAt: null }, select: { id: true, amount: true, paidAt: true, method: true, reference: true }, orderBy: { paidAt: 'asc' } } },
    });
    return charges.map(c => {
      const b = chargeBalance({ ...c, payments: c.payments.map(p => ({ ...p, voidedAt: null })) });
      return { id: c.id, item: c.item, amount: c.amount, discount: c.discount, installments: c.installments, payments: c.payments, paid: b.paid, remaining: b.remaining };
    });
  }

  @Get('student/:studentId') @RequirePermission('finance.view')
  async forStudent(@Param('studentId') studentId: string) {
    return this.prisma.studentCharge.findMany({ where: { studentId }, include: { item: true, installments: true, payments: true } });
  }
}
