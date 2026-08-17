import { RedeemPointsStep } from './redeem-points.step';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', customerId: 'cust-1', pointsRedeemed: 20 } as any,
    ...overrides,
  };
}

describe('RedeemPointsStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    const step = new RedeemPointsStep({} as any);
    await expect(step.execute(ctx())).rejects.toThrow(
      'redeem-points ran outside a transaction',
    );
  });

  it('throws a plain Error when the invoice is missing', async () => {
    const step = new RedeemPointsStep({} as any);
    await expect(
      step.execute(ctx({ manager: {} as any, invoice: undefined })),
    ).rejects.toThrow('redeem-points ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const membershipCardService = { redeemPointsForInvoice: jest.fn() };
    await new RedeemPointsStep(membershipCardService as any).execute(
      ctx({ replayed: true, manager: {} as any }),
    );
    expect(membershipCardService.redeemPointsForInvoice).not.toHaveBeenCalled();
  });

  it('does nothing when pointsRedeemed is 0', async () => {
    const membershipCardService = { redeemPointsForInvoice: jest.fn() };
    await new RedeemPointsStep(membershipCardService as any).execute(
      ctx({ manager: {} as any, invoice: { id: 'inv-1', customerId: 'cust-1', pointsRedeemed: 0 } as any }),
    );
    expect(membershipCardService.redeemPointsForInvoice).not.toHaveBeenCalled();
  });

  it('does nothing when there is no customer, even if pointsRedeemed is somehow set', async () => {
    const membershipCardService = { redeemPointsForInvoice: jest.fn() };
    await new RedeemPointsStep(membershipCardService as any).execute(
      ctx({ manager: {} as any, invoice: { id: 'inv-1', customerId: undefined, pointsRedeemed: 20 } as any }),
    );
    expect(membershipCardService.redeemPointsForInvoice).not.toHaveBeenCalled();
  });

  it('redeems the points against the locked card, in the transaction', async () => {
    const membershipCardService = { redeemPointsForInvoice: jest.fn().mockResolvedValue(undefined) };
    const c = ctx({ manager: { __fake: 'manager' } as any });

    await new RedeemPointsStep(membershipCardService as any).execute(c);

    expect(membershipCardService.redeemPointsForInvoice).toHaveBeenCalledWith(
      { customerId: 'cust-1', points: 20, invoiceId: 'inv-1' },
      c.manager,
      c.actor,
    );
  });

  it('propagates an insufficient-balance error unchanged, rolling back the checkout — never swallowed', async () => {
    const boom = new Error('insufficient points balance');
    const membershipCardService = { redeemPointsForInvoice: jest.fn().mockRejectedValue(boom) };
    await expect(
      new RedeemPointsStep(membershipCardService as any).execute(ctx({ manager: {} as any })),
    ).rejects.toBe(boom);
  });
});
