import { ClampPointsStep } from './clamp-points.step';
import { POINT_REDEMPTION_VALUE_VND } from '../../../../customer/loyalty.constants';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    items: [],
    ...overrides,
  } as CheckoutContext;
}

const line = (lineTotal: number) => ({ lineTotal }) as any;

describe('ClampPointsStep', () => {
  const step = new ClampPointsStep();

  /**
   * The exact case QA reported. Cart 580,000 with a 116,000 promotion leaves
   * 464,000 payable. 1,000 points are worth 500,000 — more than the invoice can
   * absorb. The ceiling was set on the draft before the promotion engine ran,
   * so all 1,000 points came off the card and `computeAmountDue` clamped the
   * negative remainder to 0, destroying 36,000đ of point value.
   */
  it('clamps 1,000 requested points to the 928 the invoice can actually absorb', async () => {
    const invoice: any = {
      id: 'inv-1',
      customerId: 'cust-1',
      pointsRedeemed: 1000,
      pointsDiscountAmount: 1000 * POINT_REDEMPTION_VALUE_VND,
      discountAmount: 0,
      depositAmount: 0,
    };
    const c = ctx({
      invoice,
      items: [line(580_000)],
      promotion: { promotionDiscount: 116_000, appliedPrograms: [], lineDiscounts: [] },
    });

    await step.execute(c);

    expect(invoice.pointsRedeemed).toBe(928); // floor(464,000 / 500)
    expect(invoice.pointsDiscountAmount).toBe(464_000);
    // 72 points stay on the card — the 36,000đ that used to evaporate.
    expect(1000 - invoice.pointsRedeemed).toBe(72);
  });

  it('leaves a redemption that fits completely alone', async () => {
    const invoice: any = {
      id: 'inv-1',
      customerId: 'cust-1',
      pointsRedeemed: 100,
      pointsDiscountAmount: 50_000,
      discountAmount: 0,
      depositAmount: 0,
    };
    const c = ctx({
      invoice,
      items: [line(580_000)],
      promotion: { promotionDiscount: 116_000, appliedPrograms: [], lineDiscounts: [] },
    });

    await step.execute(c);

    expect(invoice.pointsRedeemed).toBe(100);
    expect(invoice.pointsDiscountAmount).toBe(50_000);
  });

  it('does not change anything when no promotion applies — the pre-existing path', async () => {
    const invoice: any = {
      id: 'inv-1',
      customerId: 'cust-1',
      pointsRedeemed: 1000,
      pointsDiscountAmount: 500_000,
      discountAmount: 0,
      depositAmount: 0,
    };
    const c = ctx({ invoice, items: [line(580_000)] });

    await step.execute(c);

    expect(invoice.pointsRedeemed).toBe(1000);
  });

  it('clamps to zero, never negative, when the discount already covers the cart', async () => {
    const invoice: any = {
      id: 'inv-1',
      customerId: 'cust-1',
      pointsRedeemed: 1000,
      pointsDiscountAmount: 500_000,
      discountAmount: 0,
      depositAmount: 0,
    };
    const c = ctx({
      invoice,
      items: [line(100_000)],
      promotion: { promotionDiscount: 150_000, appliedPrograms: [], lineDiscounts: [] },
    });

    await step.execute(c);

    expect(invoice.pointsRedeemed).toBe(0);
    expect(invoice.pointsDiscountAmount).toBe(0);
  });

  it('floors rather than rounds up, so points never discount more than they are worth', async () => {
    // 470,300 payable / 500 = 940.6 → 940 points (470,000). The 300đ remainder
    // is paid in money; rounding up would hand over 500đ of unpaid discount.
    const invoice: any = {
      id: 'inv-1',
      customerId: 'cust-1',
      pointsRedeemed: 1000,
      pointsDiscountAmount: 500_000,
      discountAmount: 0,
      depositAmount: 0,
    };
    const c = ctx({
      invoice,
      items: [line(470_300)],
      promotion: { promotionDiscount: 0, appliedPrograms: [], lineDiscounts: [] },
    });

    await step.execute(c);

    expect(invoice.pointsRedeemed).toBe(940);
    expect(invoice.pointsDiscountAmount).toBe(470_000);
  });

  it('accounts for the voucher, which resolve-funds folds into discountAmount before this step', async () => {
    const invoice: any = {
      id: 'inv-1',
      customerId: 'cust-1',
      pointsRedeemed: 1000,
      pointsDiscountAmount: 500_000,
      // manual 50,000 + a 200,000 voucher already folded in by resolve-funds
      discountAmount: 250_000,
      depositAmount: 0,
    };
    const c = ctx({
      invoice,
      items: [line(580_000)],
      promotion: { promotionDiscount: 116_000, appliedPrograms: [], lineDiscounts: [] },
    });

    await step.execute(c);

    // 580,000 − 250,000 − 116,000 = 214,000 → floor(214,000/500) = 428
    expect(invoice.pointsRedeemed).toBe(428);
  });

  it('subtracts the deposit already paid', async () => {
    const invoice: any = {
      id: 'inv-1',
      customerId: 'cust-1',
      pointsRedeemed: 1000,
      pointsDiscountAmount: 500_000,
      discountAmount: 0,
      depositAmount: 380_000,
    };
    const c = ctx({ invoice, items: [line(580_000)] });

    await step.execute(c);

    expect(invoice.pointsRedeemed).toBe(400); // (580,000 − 380,000) / 500
  });

  it.each([
    ['no redemption requested', { pointsRedeemed: 0, customerId: 'cust-1' }],
    ['walk-in customer', { pointsRedeemed: 1000, customerId: undefined }],
  ])('is a no-op for %s', async (_label, patch) => {
    const invoice: any = {
      id: 'inv-1',
      pointsDiscountAmount: 123,
      discountAmount: 0,
      depositAmount: 0,
      ...patch,
    };
    const c = ctx({
      invoice,
      items: [line(100)],
      promotion: { promotionDiscount: 90, appliedPrograms: [], lineDiscounts: [] },
    });

    await step.execute(c);

    expect(invoice.pointsRedeemed).toBe(patch.pointsRedeemed);
    expect(invoice.pointsDiscountAmount).toBe(123);
  });

  it('throws a programming error when it runs before load-draft', async () => {
    await expect(step.execute(ctx({ invoice: undefined }))).rejects.toThrow(
      'clamp-points ran before load-draft populated the context',
    );
  });
});
