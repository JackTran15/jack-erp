import { CreateDebtStep } from './create-debt.step';
import { ComputeTotalsStep } from './compute-totals.step';
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
      keptChange: 0,
      pointsEarned: 0,
      pointsBlocked: false,
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

  // ==========================================================================
  // T-05-02 / AC-17 — the COD debt is what the shipper actually collects.
  //
  // These run the REAL `ComputeTotalsStep` (it has no dependencies) ahead of
  // this one, so the amount handed to `createFromInvoice` comes out of the real
  // `computeAmountDue`, not out of a literal written into the fixture. That is
  // what makes them a guard: drop `shippingFeeAmount` from the formula, or stop
  // threading it through `compute-totals`, and the 880.000 / 1.030.000 / 30.000
  // cases below go red. Equally, "fixing" this step by adding the fee a second
  // time turns 880.000 into 910.000 and is caught here too.
  // ==========================================================================
  describe('COD debt = fee-inclusive amount due', () => {
    async function runDebt(opts: {
      lineTotals: number[];
      discountAmount?: number;
      pointsDiscountAmount?: number;
      shippingFeeAmount?: number;
      paid?: number;
    }) {
      const invoiceDebtService = {
        createFromInvoice: jest.fn().mockResolvedValue({}),
      };
      const c = ctx({
        manager: { __fake: 'manager' } as any,
        invoice: {
          id: 'inv-1',
          customerId: 'cust-web-0909',
          discountAmount: opts.discountAmount ?? 0,
          pointsDiscountAmount: opts.pointsDiscountAmount ?? 0,
          depositAmount: 0,
          shippingFeeAmount: opts.shippingFeeAmount ?? 0,
        } as any,
        items: opts.lineTotals.map((lineTotal, i) => ({
          id: `li-${i}`,
          quantity: 1,
          unitPrice: lineTotal,
          lineTotal,
        })) as any,
        input: {
          invoiceId: 'inv-1',
          payments: opts.paid ? [{ paymentMethod: 'cash', amount: opts.paid }] : [],
        } as any,
        accounts: { receivableAccountId: 'acc-131' } as any,
        totals: undefined,
      });

      await new ComputeTotalsStep().execute(c);
      await new CreateDebtStep(invoiceDebtService as any).execute(c);

      return {
        amountDue: c.totals!.amountDue,
        debtAmount: invoiceDebtService.createFromInvoice.mock.calls[0]?.[1],
        createFromInvoice: invoiceDebtService.createFromInvoice,
        invoice: c.invoice,
      };
    }

    it('1.000.000 − 100.000 − 50.000 + 30.000 fee → the debt opens at 880.000', async () => {
      const r = await runDebt({
        lineTotals: [1_000_000],
        discountAmount: 100_000,
        pointsDiscountAmount: 50_000,
        shippingFeeAmount: 30_000,
      });

      expect(r.amountDue).toBe(880_000);
      expect(r.debtAmount).toBe(880_000);
      // The step passes the remainder straight through: no fee added here.
      expect(r.debtAmount).not.toBe(910_000);
      // And the fee is not lost on the way: the pre-fee number is 850.000.
      expect(r.debtAmount).not.toBe(850_000);
    });

    it('demo case: 1.000.000 goods + 30.000 fee, nothing paid → the debt opens at 1.030.000', async () => {
      const r = await runDebt({ lineTotals: [1_000_000], shippingFeeAmount: 30_000 });

      expect(r.amountDue).toBe(1_030_000);
      expect(r.debtAmount).toBe(1_030_000);
      expect(r.createFromInvoice).toHaveBeenCalledWith(
        r.invoice,
        1_030_000,
        expect.anything(),
        { dueDate: undefined, creditDays: undefined },
      );
    });

    it('a fee-free invoice is numerically identical to before the fee existed (850.000)', async () => {
      const r = await runDebt({
        lineTotals: [1_000_000],
        discountAmount: 100_000,
        pointsDiscountAmount: 50_000,
      });

      expect(r.amountDue).toBe(850_000);
      expect(r.debtAmount).toBe(850_000);
    });

    it('goods part fully discounted → the debt is exactly the 30.000 fee (A-22)', async () => {
      const r = await runDebt({
        lineTotals: [1_000_000],
        discountAmount: 1_000_000,
        shippingFeeAmount: 30_000,
      });

      expect(r.amountDue).toBe(30_000);
      expect(r.debtAmount).toBe(30_000);
    });

    it('the customer paying the goods part at the counter leaves exactly the fee on credit', async () => {
      const r = await runDebt({
        lineTotals: [1_000_000],
        shippingFeeAmount: 30_000,
        paid: 1_000_000,
      });

      expect(r.amountDue).toBe(1_030_000);
      expect(r.debtAmount).toBe(30_000);
    });

    it('a fee-bearing invoice paid in full opens no debt at all', async () => {
      const r = await runDebt({
        lineTotals: [1_000_000],
        shippingFeeAmount: 30_000,
        paid: 1_030_000,
      });

      expect(r.createFromInvoice).not.toHaveBeenCalled();
    });
  });
});
