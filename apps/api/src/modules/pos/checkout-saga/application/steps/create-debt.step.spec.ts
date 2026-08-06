import { CreateDebtStep } from './create-debt.step';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [], dueDate: '2026-08-20', creditDays: 15 },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', customerId: 'cust-1' } as any,
    totals: {
      subtotal: 200,
      manualDiscountAmount: 0,
      promotionDiscount: 0,
      pointsDiscountAmount: 0,
      depositAmount: 0,
      amountDue: 200,
      totalPaid: 100,
      remainder: 100,
      pointsEarned: 0,
      newStatus: InvoiceStatus.PARTIAL_DEBT,
    },
    ...overrides,
  };
}

describe('CreateDebtStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    const step = new CreateDebtStep({} as any);
    await expect(step.execute(ctx())).rejects.toThrow(
      'create-debt ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/totals are missing', async () => {
    const step = new CreateDebtStep({} as any);
    await expect(
      step.execute(ctx({ manager: {} as any, totals: undefined })),
    ).rejects.toThrow('create-debt ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const invoiceDebtService = { createFromInvoice: jest.fn() };
    await new CreateDebtStep(invoiceDebtService as any).execute(
      ctx({ replayed: true, manager: {} as any }),
    );
    expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
  });

  it('does nothing when remainder <= 0 (fully paid)', async () => {
    const invoiceDebtService = { createFromInvoice: jest.fn() };
    await new CreateDebtStep(invoiceDebtService as any).execute(
      ctx({
        manager: {} as any,
        totals: { ...ctx().totals!, remainder: 0, newStatus: InvoiceStatus.PAID },
      }),
    );
    expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
  });

  it('creates the debt with the invoice, remainder and the client-supplied terms', async () => {
    const invoiceDebtService = { createFromInvoice: jest.fn().mockResolvedValue({}) };
    const c = ctx({ manager: { __fake: 'manager' } as any });

    await new CreateDebtStep(invoiceDebtService as any).execute(c);

    expect(invoiceDebtService.createFromInvoice).toHaveBeenCalledWith(
      c.invoice,
      100,
      c.manager,
      { dueDate: '2026-08-20', creditDays: 15 },
    );
  });

  it('propagates the dueDate-before-issue-date validation error unchanged, rolling back the checkout', async () => {
    const boom = new Error('dueDate must be on or after the issue date');
    const invoiceDebtService = { createFromInvoice: jest.fn().mockRejectedValue(boom) };
    await expect(
      new CreateDebtStep(invoiceDebtService as any).execute(ctx({ manager: {} as any })),
    ).rejects.toBe(boom);
  });
});
