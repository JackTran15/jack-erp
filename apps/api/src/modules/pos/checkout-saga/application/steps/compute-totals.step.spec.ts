import { ComputeTotalsStep } from './compute-totals.step';
import { computeAmountDue } from '../../../services/invoice-amount.util';
import {
  InvoicePaymentMethod,
  InvoiceStatus,
} from '../../../entities/invoice.entity';
import { CheckoutContext } from '../checkout-step';

/**
 * T-04-04 — the delivery-fee half of `ComputeTotalsStep`.
 *
 * The step's general behaviour is covered in `preflight-steps.spec.ts`; this
 * file exists for one reason only. `compute-totals.step.ts` builds an object
 * literal for `computeAmountDue` instead of handing it the invoice entity, and
 * `shippingFeeAmount` is an optional parameter defaulting to 0 — so a call site
 * that forgets it keeps returning a perfectly plausible (and wrong) number.
 * Reading the code does not catch that; only a case with a fee != 0 does.
 *
 * Every fixture below therefore puts a real fee on the draft and asserts the
 * fee is inside `amountDue`. Numbers come from the UOW-04 demo script
 * (1.000.000 goods, 100.000 discount, 50.000 points, 30.000 fee → 880.000).
 */

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'c1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    ...overrides,
  } as CheckoutContext;
}

const line = (lineTotal: number) => ({ lineTotal }) as any;

const draft = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'inv-1',
    discountAmount: 0,
    pointsDiscountAmount: 0,
    depositAmount: 0,
    shippingFeeAmount: 0,
    customerId: 'cust-1',
    ...overrides,
  }) as any;

const cash = (amount: number) => [
  { paymentMethod: InvoicePaymentMethod.CASH, amount },
];

describe('ComputeTotalsStep — delivery fee (T-04-04, AC-25/AC-27)', () => {
  const step = new ComputeTotalsStep();

  it('AC-25: adds the delivery fee to amountDue — the demo-script invoice comes to 880.000', async () => {
    const c = ctx({
      invoice: draft({
        discountAmount: 100_000,
        pointsDiscountAmount: 50_000,
        shippingFeeAmount: 30_000,
      }),
      items: [line(1_000_000)],
      input: { invoiceId: 'inv-1', payments: cash(880_000) },
    });

    await step.execute(c);

    // 1.000.000 − 100.000 − 50.000 = 850.000 goods, + 30.000 fee.
    expect(c.totals!.amountDue).toBe(880_000);
    expect(c.totals!.newStatus).toBe(InvoiceStatus.PAID);
  });

  it('AC-25: a discount that swallows the goods still leaves the fee payable, not 0', async () => {
    const c = ctx({
      invoice: draft({ discountAmount: 500_000, shippingFeeAmount: 30_000 }),
      items: [line(100_000)],
      input: { invoiceId: 'inv-1', payments: cash(30_000) },
    });

    await step.execute(c);

    // The clamp wraps the goods part only: max(0, 100.000 − 500.000) = 0, + fee.
    expect(c.totals!.amountDue).toBe(30_000);
  });

  it('AC-25: the promotion discount cannot eat the fee either', async () => {
    const c = ctx({
      invoice: draft({ discountAmount: 20_000, shippingFeeAmount: 30_000 }),
      items: [line(100_000)],
      promotion: {
        promotionDiscount: 300_000,
        appliedPrograms: [],
        lineDiscounts: [],
      },
      input: { invoiceId: 'inv-1', payments: cash(30_000) },
    });

    await step.execute(c);

    expect(c.totals!.amountDue).toBe(30_000);
  });

  it('AC-27: the step matches the shared helper exactly — no reimplemented formula', async () => {
    const c = ctx({
      invoice: draft({
        discountAmount: 100_000,
        pointsDiscountAmount: 50_000,
        shippingFeeAmount: 30_000,
      }),
      items: [line(685_000), line(315_000)],
      input: { invoiceId: 'inv-1', payments: cash(880_000) },
    });

    await step.execute(c);

    expect(c.totals!.amountDue).toBe(
      computeAmountDue({
        subtotal: 1_000_000,
        discountAmount: 100_000,
        pointsDiscountAmount: 50_000,
        depositAmount: 0,
        shippingFeeAmount: 30_000,
      }),
    );
  });

  it('coerces the fee TypeORM hands back as a string instead of concatenating it', async () => {
    const c = ctx({
      // numeric(18,2) arrives as '30000.00', so `goods + fee` without Number()
      // would produce the string '85000030000.00' and a nonsense total.
      invoice: draft({ discountAmount: '100000.00', shippingFeeAmount: '30000.00' }),
      items: [line(1_000_000)],
      input: { invoiceId: 'inv-1', payments: cash(930_000) },
    });

    await step.execute(c);

    expect(c.totals!.amountDue).toBe(930_000);
  });

  it('rejects a payment that exceeds goods + fee, and accepts one that covers both', async () => {
    const overpaid = ctx({
      invoice: draft({ shippingFeeAmount: 30_000 }),
      items: [line(100_000)],
      input: { invoiceId: 'inv-1', payments: cash(130_001) },
    });
    await expect(step.execute(overpaid)).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID' },
    });

    const settled = ctx({
      invoice: draft({ shippingFeeAmount: 30_000 }),
      items: [line(100_000)],
      input: { invoiceId: 'inv-1', payments: cash(130_000) },
    });
    await step.execute(settled);
    expect(settled.totals!.remainder).toBe(0);
    expect(settled.totals!.newStatus).toBe(InvoiceStatus.PAID);
  });

  it('carries the unpaid fee into the remainder, so a COD debt is not short by the fee', async () => {
    const c = ctx({
      invoice: draft({ shippingFeeAmount: 30_000 }),
      items: [line(100_000)],
      input: { invoiceId: 'inv-1', payments: [] },
      accounts: {
        revenueAccountId: 'acct-rev-1',
        receivableAccountId: 'acct-ar-1',
        perPayment: [],
      },
    });

    await step.execute(c);

    expect(c.totals!.amountDue).toBe(130_000);
    expect(c.totals!.remainder).toBe(130_000);
    expect(c.totals!.newStatus).toBe(InvoiceStatus.DEBT);
  });

  it('leaves a fee-less counter sale on exactly its old number', async () => {
    const c = ctx({
      invoice: draft({ discountAmount: 50_000 }),
      items: [line(785_000)],
      input: { invoiceId: 'inv-1', payments: cash(735_000) },
    });

    await step.execute(c);

    expect(c.totals!.amountDue).toBe(735_000);
  });
});

/**
 * T-04-06 — the loyalty half of the same step.
 *
 * T-04-04 (above) put the fee inside `amountDue`, and `pointsEarned` was floored
 * from `amountDue`, so the fee silently started earning points. The clawback base
 * never had the fee in it, so the two sides no longer met. A-24: earn on the
 * goods part.
 *
 * `amountDue` is asserted alongside `pointsEarned` in every case below on purpose
 * — the fee must come OUT of the earn base without coming out of what the
 * customer owes.
 */
describe('ComputeTotalsStep — loyalty earns on goods, not on the fee (T-04-06, A-24)', () => {
  const step = new ComputeTotalsStep();

  it('earns on the 1.000.000 goods part, not on 1.030.000 and not on the 880.000 total', async () => {
    const c = ctx({
      invoice: draft({
        discountAmount: 100_000,
        pointsDiscountAmount: 50_000,
        shippingFeeAmount: 30_000,
      }),
      items: [line(1_000_000)],
      input: { invoiceId: 'inv-1', payments: cash(880_000) },
    });

    await step.execute(c);

    // Goods net = 1.000.000 − 100.000 − 50.000 = 850.000 → 85 points.
    // The fee still has to be collected, so amountDue keeps it.
    expect(c.totals!.amountDue).toBe(880_000);
    expect(c.totals!.pointsEarned).toBe(85);
    // Guard the exact defect: 880.000/10.000 = 88 was the pre-fix number, and
    // 103 would be earning on the undiscounted 1.030.000.
    expect(c.totals!.pointsEarned).not.toBe(88);
  });

  it('leaves a fee-less invoice on exactly the points it earned before the fix', async () => {
    const c = ctx({
      invoice: draft({ discountAmount: 50_000 }),
      items: [line(785_000)],
      input: { invoiceId: 'inv-1', payments: cash(735_000) },
    });

    await step.execute(c);

    // No fee => `amountDue − 0` is the identity, so this is the old number.
    expect(c.totals!.amountDue).toBe(735_000);
    expect(c.totals!.pointsEarned).toBe(73);
  });

  it('subtracts the string TypeORM hands back for numeric(18,2) instead of concatenating it', async () => {
    const c = ctx({
      // Without Number(), 880000 - '30000.00' happens to coerce correctly in JS,
      // but 880000 + '30000.00' upstream does not — this pins the earn base at
      // the numeric value in both directions.
      invoice: draft({
        discountAmount: '100000.00',
        pointsDiscountAmount: '50000.00',
        shippingFeeAmount: '30000.00',
      }),
      items: [line(1_000_000)],
      input: { invoiceId: 'inv-1', payments: cash(880_000) },
    });

    await step.execute(c);

    expect(c.totals!.amountDue).toBe(880_000);
    expect(c.totals!.pointsEarned).toBe(85);
  });

  it('earns nothing when a discount swallows the goods and only the fee is payable', async () => {
    const c = ctx({
      invoice: draft({ discountAmount: 500_000, shippingFeeAmount: 30_000 }),
      items: [line(100_000)],
      input: { invoiceId: 'inv-1', payments: cash(30_000) },
    });

    await step.execute(c);

    // amountDue is the fee alone; the goods part is 0, so there is nothing to earn on.
    expect(c.totals!.amountDue).toBe(30_000);
    expect(c.totals!.pointsEarned).toBe(0);
  });
});
