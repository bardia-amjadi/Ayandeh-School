import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { chargeBalance, splitInstallments } from './money';
const D = (v: number | string) => new Prisma.Decimal(v);

describe('money', () => {
  it('splits installments exactly, remainder on last', () => {
    const parts = splitInstallments(D(1000), 3);
    expect(parts.map(String)).toEqual(['333', '333', '334']);
    expect(parts.reduce((a, b) => a.plus(b), D(0)).toString()).toBe('1000');
  });
  it('balance = amount - discount - non-voided payments', () => {
    const b = chargeBalance({ amount: D(1000), discount: D(100), voidedAt: null,
      payments: [{ amount: D(300), voidedAt: null }, { amount: D(200), voidedAt: new Date() }] });
    expect(b.remaining.toString()).toBe('600');
  });
});
