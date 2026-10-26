import { Prisma } from '@prisma/client';

export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface ChargeLike { amount: Prisma.Decimal; discount: Prisma.Decimal; voidedAt: Date | null; payments: { amount: Prisma.Decimal; voidedAt: Date | null }[]; }

/** remaining = (amount - discount) - sum(non-voided payments); never negative-rounded, all Decimal. */
export function chargeBalance(c: ChargeLike) {
  const net = c.amount.minus(c.discount);
  const paid = c.payments.filter(p => !p.voidedAt).reduce((s, p) => s.plus(p.amount), D(0));
  return { net, paid, remaining: c.voidedAt ? D(0) : net.minus(paid) };
}

/** Split `total` into n installments with whole-unit amounts; the last one absorbs the remainder. */
export function splitInstallments(total: Prisma.Decimal, n: number): Prisma.Decimal[] {
  if (n < 1) throw new Error('installments must be >= 1');
  const base = total.dividedBy(n).floor();
  const parts = Array.from({ length: n }, () => base);
  parts[n - 1] = total.minus(base.times(n - 1));
  return parts;
}
