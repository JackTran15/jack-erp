import { ConflictException } from '@nestjs/common';
import { RedeemVoucherStep } from './redeem-voucher.step';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1' } as any,
    ...overrides,
  };
}

describe('RedeemVoucherStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    const step = new RedeemVoucherStep({} as any);
    await expect(step.execute(ctx({ voucherId: 'v1' }))).rejects.toThrow(
      'redeem-voucher ran outside a transaction',
    );
  });

  it('is a no-op when there is no voucher on this checkout — never calls markUsed', async () => {
    const voucherService = { markUsed: jest.fn() };
    await new RedeemVoucherStep(voucherService as any).execute(
      ctx({ manager: {} as any }), // no voucherId
    );
    expect(voucherService.markUsed).not.toHaveBeenCalled();
  });

  it('is a no-op on a replayed run, even with a voucherId set', async () => {
    const voucherService = { markUsed: jest.fn() };
    await new RedeemVoucherStep(voucherService as any).execute(
      ctx({ replayed: true, manager: {} as any, voucherId: 'v1' }),
    );
    expect(voucherService.markUsed).not.toHaveBeenCalled();
  });

  it('marks the voucher used with the invoice id and the transaction manager', async () => {
    const voucherService = { markUsed: jest.fn().mockResolvedValue(undefined) };
    const manager = { __fake: 'manager' };
    const c = ctx({ manager: manager as any, voucherId: 'voucher-1', invoice: { id: 'inv-1' } as any });

    await new RedeemVoucherStep(voucherService as any).execute(c);

    expect(voucherService.markUsed).toHaveBeenCalledWith('voucher-1', 'inv-1', manager);
  });

  it('propagates ConflictException from markUsed unchanged — the real race guard, not resolve-funds', async () => {
    const boom = new ConflictException('Voucher voucher-1 is already used or inactive');
    const voucherService = { markUsed: jest.fn().mockRejectedValue(boom) };
    const c = ctx({ manager: {} as any, voucherId: 'voucher-1' });

    await expect(new RedeemVoucherStep(voucherService as any).execute(c)).rejects.toBe(boom);
  });

  it('throws a plain Error when ctx.invoice is missing', async () => {
    const voucherService = { markUsed: jest.fn() };
    const c = ctx({ manager: {} as any, voucherId: 'voucher-1', invoice: undefined });

    await expect(new RedeemVoucherStep(voucherService as any).execute(c)).rejects.toThrow(
      'redeem-voucher ran before its prerequisite steps populated the context',
    );
  });
});
