import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { PushService } from '../push/push.service';

class CreateTicketDto { @IsString() @MinLength(3) @MaxLength(150) subject: string; @IsString() @MinLength(1) @MaxLength(5000) message: string; }
class ReplyDto { @IsString() @MinLength(1) @MaxLength(5000) body: string; }

@Controller('tickets')
export class TicketsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private push: PushService) {}
  private isStaff = (u: AuthUser) => u.permissions.has('tickets.manage');

  // Owner or ticket staff only; anyone else gets 404-equivalent forbidden.
  private async load(id: string, u: AuthUser) {
    const t = await this.prisma.ticket.findUniqueOrThrow({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (t.studentId !== u.id && !this.isStaff(u)) throw new ForbiddenException();
    return t;
  }

  @Post()
  async create(@Body() dto: CreateTicketDto, @CurrentUser() u: AuthUser) {
    if (u.role !== 'STUDENT') throw new ForbiddenException('فقط دانش‌آموزان می‌توانند تیکت ثبت کنند');
    const t = await this.prisma.ticket.create({ data: { studentId: u.id, subject: dto.subject, messages: { create: { authorId: u.id, body: dto.message } } } });
    await this.audit.log(u.id, 'ticket.create', 'Ticket', t.id);
    return t;
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('status') status?: 'OPEN' | 'CLOSED') {
    const where = { ...(this.isStaff(u) ? {} : { studentId: u.id }), ...(status ? { status } : {}) };
    return this.prisma.ticket.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.load(id, u); }

  @Post(':id/messages')
  async reply(@Param('id') id: string, @Body() dto: ReplyDto, @CurrentUser() u: AuthUser) {
    const t = await this.load(id, u);
    if (t.status === 'CLOSED') throw new ForbiddenException('تیکت بسته شده است');
    const m = await this.prisma.ticketMessage.create({ data: { ticketId: id, authorId: u.id, body: dto.body } });
    await this.prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
    await this.audit.log(u.id, 'ticket.reply', 'Ticket', id); // body deliberately not logged
    if (u.id !== t.studentId) void this.push.notify([t.studentId], 'tickets');
    return m;
  }

  @Patch(':id/close')
  async close(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    if (!this.isStaff(u)) throw new ForbiddenException();
    const t = await this.prisma.ticket.update({ where: { id }, data: { status: 'CLOSED' } });
    await this.audit.log(u.id, 'ticket.close', 'Ticket', id);
    return t;
  }
}
