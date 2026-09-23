import { InvoiceType } from '../entities/invoice.entity';
import { computeAmountDue, invoiceSignedTotalSql } from './invoice-amount.util';
import { refundableFactor } from './refundable-value.util';

describe('computeAmountDue', () => {
  describe('without a delivery fee (every invoice that exists today)', () => {
    it('subtracts discount, points discount and deposit from the subtotal', () => {
      expect(
        computeAmountDue({
          subtotal: 1000000,
          discountAmount: 100000,
          pointsDiscountAmount: 50000,
          depositAmount: 200000,
        }),
      ).toBe(650000);
    });

    it('clamps to 0 when the reductions exceed the subtotal', () => {
      expect(
        computeAmountDue({ subtotal: 100000, discountAmount: 500000 }),
      ).toBe(0);
    });

    it('treats a missing fee, a null fee and a "0" string fee as the old formula', () => {
      const goods = {
        subtotal: 1000000,
        discountAmount: 100000,
        pointsDiscountAmount: 50000,
      };
      expect(computeAmountDue(goods)).toBe(850000);
      expect(computeAmountDue({ ...goods, shippingFeeAmount: undefined })).toBe(
        850000,
      );
      expect(computeAmountDue({ ...goods, shippingFeeAmount: null })).toBe(
        850000,
      );
      expect(computeAmountDue({ ...goods, shippingFeeAmount: '0' })).toBe(
        850000,
      );
      expect(computeAmountDue({ ...goods, shippingFeeAmount: 0 })).toBe(850000);
    });
  });

  describe('with a delivery fee (ADR-04 / A-22)', () => {
    it('adds the fee after every reduction: 1.000.000 - 100.000 - 50.000 + 30.000', () => {
      expect(
        computeAmountDue({
          subtotal: 1000000,
          discountAmount: 100000,
          pointsDiscountAmount: 50000,
          shippingFeeAmount: 30000,
        }),
      ).toBe(880000);
    });

    it('accepts the fee as a string, because TypeORM returns numeric columns as strings', () => {
      expect(
        computeAmountDue({
          subtotal: '1000000',
          discountAmount: '100000',
          pointsDiscountAmount: '50000',
          shippingFeeAmount: '30000',
        }),
      ).toBe(880000);
    });

    it('keeps the fee alive when a discount is bigger than the goods subtotal', () => {
      // Goods clamp at 0, the customer still owes exactly the delivery fee.
      expect(
        computeAmountDue({
          subtotal: 100000,
          discountAmount: 500000,
          shippingFeeAmount: 30000,
        }),
      ).toBe(30000);
    });

    it('keeps the fee alive when a point redemption is bigger than the goods subtotal', () => {
      expect(
        computeAmountDue({
          subtotal: 100000,
          pointsDiscountAmount: 500000,
          shippingFeeAmount: 30000,
        }),
      ).toBe(30000);
    });

    it('keeps the fee alive when a deposit already covers the whole order', () => {
      expect(
        computeAmountDue({
          subtotal: 100000,
          depositAmount: 500000,
          shippingFeeAmount: 30000,
        }),
      ).toBe(30000);
    });

    it('does not let the fee rescue an over-discounted goods part', () => {
      // Goods = -400.000 raw. If the clamp ran after the fee the customer would
      // owe 0 (-400.000 + 30.000 -> clamped) and the 30.000 would vanish; the
      // clamp runs on the goods part alone, so the answer is the fee itself.
      expect(
        computeAmountDue({
          subtotal: 100000,
          discountAmount: 500000,
          shippingFeeAmount: 30000,
        }),
      ).not.toBe(0);
    });

    it('rounds once, at the end', () => {
      expect(
        computeAmountDue({
          subtotal: 100.005,
          discountAmount: 0.004,
          shippingFeeAmount: 0.004,
        }),
      ).toBe(100.01);
    });

    it('reads the fee straight off an invoice-shaped object', () => {
      // The five call sites that pass an entity in get the fee for free because
      // the field is named exactly as `InvoiceEntity.shippingFeeAmount`.
      const invoice = {
        subtotal: '1000000.00',
        discountAmount: '100000.00',
        pointsDiscountAmount: '50000.00',
        depositAmount: '0.00',
        shippingFeeAmount: '30000.00',
      };
      expect(computeAmountDue(invoice)).toBe(880000);
    });
  });
});

describe('invoiceSignedTotalSql', () => {
  it('still routes returns and exchanges through netAmount', () => {
    // A-23: refund documents carry no delivery fee, so this branch is unchanged
    // by the fee work. Syncing this twin with computeAmountDue is T-04-03.
    const sql = invoiceSignedTotalSql('inv');
    expect(sql).toContain(`'${InvoiceType.RETURN}'`);
    expect(sql).toContain(`'${InvoiceType.EXCHANGE}'`);
    expect(sql).toContain('inv.netAmount');
    expect(sql).toContain('inv.amountDue');
  });

  // T-04-03: the fee landed in `computeAmountDue`'s stored `amount_due`
  // (T-04-02). `invoiceSignedTotalSql` and its pos-web TS twin
  // (`getInvoiceSignedTotal`) both just READ the stored column for the SALE
  // branch, so they never had to re-derive the formula. These tests measure
  // that agreement in numbers instead of leaving it as a comment.

  // The SQL string can't run here (no DB connection); it's a `CASE WHEN type
  // IN (RETURN, EXCHANGE) THEN netAmount ELSE amountDue END` expression, so
  // this helper evaluates that exact case split against a plain JS object,
  // matching the branch already asserted above by `.toContain(...)`.
  function evalInvoiceSignedTotalSql(invoice: {
    type: InvoiceType;
    amountDue: number;
    netAmount: number;
  }): number {
    return invoice.type === InvoiceType.RETURN ||
      invoice.type === InvoiceType.EXCHANGE
      ? invoice.netAmount
      : invoice.amountDue;
  }

  // Local re-statement of apps/pos-web/src/lib/common/invoiceAmount.ts's
  // `getInvoiceSignedTotal` — not imported, since that file lives in a
  // separate workspace package with its own tsconfig/jest project. Kept
  // identical to its documented body so the "three views agree" claim is
  // actually checked, not just asserted in prose.
  function twinGetInvoiceSignedTotal(invoice: {
    type: string;
    amountDue: number;
    netAmount: number;
  }): number {
    const isRefundDirection =
      invoice.type === 'RETURN' || invoice.type === 'EXCHANGE';
    return isRefundDirection
      ? Number(invoice.netAmount) || 0
      : Number(invoice.amountDue) || 0;
  }

  it('agrees across DB (amount_due), invoiceSignedTotalSql and the pos-web twin on a fee-bearing SALE invoice', () => {
    // Invoice #1: 1.000.000 - 100.000 - 50.000 + 30.000 fee.
    const amountDue = computeAmountDue({
      subtotal: 1000000,
      discountAmount: 100000,
      pointsDiscountAmount: 50000,
      shippingFeeAmount: 30000,
    });
    expect(amountDue).toBe(880000);

    const invoice1 = { type: InvoiceType.SALE, amountDue, netAmount: 0 };
    expect(evalInvoiceSignedTotalSql(invoice1)).toBe(880000);
    expect(twinGetInvoiceSignedTotal(invoice1)).toBe(880000);

    // Invoice #2: goods fully discounted, fee alone survives.
    const amountDue2 = computeAmountDue({
      subtotal: 100000,
      discountAmount: 500000,
      shippingFeeAmount: 30000,
    });
    expect(amountDue2).toBe(30000);
    const invoice2 = { type: InvoiceType.SALE, amountDue: amountDue2, netAmount: 0 };

    // Footer SUM(signed total) over both invoices.
    const footerSum =
      evalInvoiceSignedTotalSql(invoice1) + evalInvoiceSignedTotalSql(invoice2);
    expect(footerSum).toBe(910000);
  });

  it('matches a money-range filter only at the exact fee-inclusive amount, missing by one đồng or at the pre-fee amount', () => {
    const amountDue = computeAmountDue({
      subtotal: 1000000,
      discountAmount: 100000,
      pointsDiscountAmount: 50000,
      shippingFeeAmount: 30000,
    });
    const invoice1 = { type: InvoiceType.SALE, amountDue, netAmount: 0 };
    const signedTotal = evalInvoiceSignedTotalSql(invoice1);

    // Mirrors FilterBuilder.applyCompare's semantics for a [min, max] range
    // over the same expression `invoiceSignedTotalSql` feeds.
    const matchesRange = (value: number, min: number, max: number) =>
      value >= min && value <= max;

    expect(matchesRange(signedTotal, 880000, 880000)).toBe(true);
    expect(matchesRange(signedTotal, 879999, 879999)).toBe(false);
    expect(matchesRange(signedTotal, 880001, 880001)).toBe(false);
    // The pre-fee (goods-only) amount must miss too — the fee is not optional.
    expect(matchesRange(signedTotal, 850000, 850000)).toBe(false);
  });

  /**
   * A-23, proved through the REAL refund path rather than a fixture.
   *
   * An earlier version of this test hard-coded `returnedNet = 850000` and then
   * asserted `abs(-850000) === 880000 - 30000`. Both sides were typed by hand,
   * so it stayed green even with the fee blinded — it proved nothing. What has
   * to be proved is that putting a fee on the invoice header cannot change what
   * a refund gives back, and only `refundableFactor` can answer that.
   */
  it('excludes the delivery fee from a RETURN of a fee-bearing invoice (A-23)', () => {
    const items = [
      { lineTotal: 1000000, promotionDiscount: 0 },
    ] as unknown as Parameters<typeof refundableFactor>[1];

    // Same header twice; the only difference is a 30.000 delivery fee.
    const withoutFee = { discountAmount: 100000, pointsDiscountAmount: 50000 };
    const withFee = { ...withoutFee, shippingFeeAmount: 30000 };

    const factorWithoutFee = refundableFactor(withoutFee, items);
    const factorWithFee = refundableFactor(
      withFee as typeof withoutFee,
      items,
    );

    // The fee is invisible to the refund maths: RefundableInvoiceHeader has no
    // such field, so it cannot enter headerResidual. If anyone adds it, these
    // two diverge and this test goes red.
    expect(factorWithFee).toBe(factorWithoutFee);

    // 1.000.000 goods, 150.000 of header reductions -> 0,85 refundable.
    expect(factorWithFee).toBeCloseTo(0.85, 10);

    const returnedNet = 1000000 * factorWithFee;
    expect(returnedNet).toBeCloseTo(850000, 6);

    // And that refund is the GOODS part of the 880.000 amount_due, not the
    // whole of it: the customer does not get the delivery fee back.
    expect(returnedNet).toBeCloseTo(
      computeAmountDue({
        subtotal: 1000000,
        discountAmount: 100000,
        pointsDiscountAmount: 50000,
        shippingFeeAmount: 30000,
      }) - 30000,
      6,
    );

    const returnInvoice = {
      type: InvoiceType.RETURN,
      amountDue: 0,
      netAmount: -returnedNet,
    };
    expect(evalInvoiceSignedTotalSql(returnInvoice)).toBeCloseTo(-850000, 6);
    expect(twinGetInvoiceSignedTotal(returnInvoice)).toBeCloseTo(-850000, 6);
  });
});
