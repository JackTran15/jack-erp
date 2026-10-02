import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import { InvoiceType } from '../../pos/entities/invoice.entity';
import { allocateInvoicePoints, allocatePoints } from './allocate-points.util';

const out = (lineTotal: number) => ({ direction: ItemDirection.OUT, lineTotal });
const inn = (lineTotal: number) => ({ direction: ItemDirection.IN, lineTotal });

describe('allocatePoints', () => {
  it('gives the whole amount to a single line', () => {
    const lines = [out(500_000)];
    expect([...allocatePoints(100_000, lines).values()]).toEqual([100_000]);
  });

  it('splits in whole đồng, rounding cumulatively so the shares add up exactly', () => {
    const lines = [out(100), out(100), out(100)];
    const alloc = [...allocatePoints(100_000, lines).values()];

    // round(⅓P)=33.333, round(⅔P)=66.667 → 33.333 / 33.334 / 33.333
    expect(alloc).toEqual([33_333, 33_334, 33_333]);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it('never yields a fraction of a đồng on uneven lines', () => {
    // The prod case: 50.000 of points over lines of 460.000, 420.000 and 1.830.000.
    const lines = [out(460_000), out(420_000), out(1_830_000)];
    const alloc = [...allocatePoints(50_000, lines).values()];

    expect(alloc.every(Number.isInteger)).toBe(true);
    expect(alloc).toEqual([8_487, 7_749, 33_764]);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(50_000);
  });

  it('walks lines in id order, the order the SQL twin uses', () => {
    const a = { id: 'b-2', direction: ItemDirection.OUT, lineTotal: 100 };
    const b = { id: 'a-1', direction: ItemDirection.OUT, lineTotal: 100 };
    const alloc = allocatePoints(1, [a, b]);

    // 'a-1' comes first: round(½) = 1 lands on it, 'b-2' gets 0.
    expect(alloc.get(b)).toBe(1);
    expect(alloc.get(a)).toBe(0);
  });

  it('mirrors a sale on a RETURN (half away from zero)', () => {
    const alloc = [...allocatePoints(-100_000, [inn(100), inn(100), inn(100)]).values()];
    expect(alloc).toEqual([-33_333, -33_334, -33_333]);
  });

  it('weights by line size, not line count', () => {
    const lines = [out(300_000), out(100_000)];
    expect([...allocatePoints(80_000, lines).values()]).toEqual([60_000, 20_000]);
  });

  it('carries the sign the caller gave it — a RETURN allocates negative', () => {
    // The caller pre-signs with invoiceTypeSign, matching what the invoice-grain
    // reports do to `points_discount_amount`; otherwise the four totals diverge.
    const lines = [inn(500_000)];
    expect([...allocatePoints(-100_000, lines).values()]).toEqual([-100_000]);
  });

  it('allocates an EXCHANGE only over its sold leg, never the returned one', () => {
    const lines = [out(750_000), inn(750_000)];
    const alloc = [...allocatePoints(100_000, lines).values()];

    expect(alloc).toEqual([100_000, 0]);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it('falls back to the IN lines for a pure RETURN, which has no sold leg', () => {
    const lines = [inn(300_000), inn(100_000)];
    const alloc = [...allocatePoints(-80_000, lines).values()];

    expect(alloc).toEqual([-60_000, -20_000]);
  });

  it('lands everything on the first line when every sold line is free', () => {
    const lines = [out(0), out(0)];
    expect([...allocatePoints(100_000, lines).values()]).toEqual([100_000, 0]);
  });

  it('allocates zero to every line when the invoice redeemed no points', () => {
    const lines = [out(100), out(200)];
    expect([...allocatePoints(0, lines).values()]).toEqual([0, 0]);
  });

  it('returns an empty map for an invoice with no lines', () => {
    expect(allocatePoints(100_000, []).size).toBe(0);
  });

  it('always sums back to the header amount', () => {
    const lines = [out(333), out(333), out(334), out(1)];
    const alloc = [...allocatePoints(77_777, lines).values()];

    expect(alloc.reduce((a, b) => a + b, 0)).toBe(77_777);
  });
});

describe('allocateInvoicePoints', () => {
  const li = (invoiceId: string, direction: ItemDirection, lineTotal: number) => ({
    invoiceId,
    direction,
    lineTotal,
  });

  it('allocates each invoice over its own lines, signed by invoice type', () => {
    const a1 = li('sale', ItemDirection.OUT, 300_000);
    const a2 = li('sale', ItemDirection.OUT, 100_000);
    const r1 = li('return', ItemDirection.IN, 500_000);
    const out = allocateInvoicePoints(
      [
        { id: 'sale', type: InvoiceType.SALE, pointsDiscountAmount: 80_000 },
        { id: 'return', type: InvoiceType.RETURN, pointsDiscountAmount: 20_000 },
      ],
      [a1, r1, a2],
    );

    expect(out.get(a1)).toBe(60_000);
    expect(out.get(a2)).toBe(20_000);
    expect(out.get(r1)).toBe(-20_000);
  });

  it('keeps an EXCHANGE returned leg out of the split', () => {
    const sold = li('x', ItemDirection.OUT, 780_000);
    const back = li('x', ItemDirection.IN, 720_000);
    const out = allocateInvoicePoints(
      [{ id: 'x', type: InvoiceType.EXCHANGE, pointsDiscountAmount: 20_000 }],
      [sold, back],
    );

    expect(out.get(sold)).toBe(20_000);
    expect(out.get(back)).toBe(0);
  });
});
