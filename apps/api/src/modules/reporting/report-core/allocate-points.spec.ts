import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import { allocatePoints } from './allocate-points.util';

const out = (lineTotal: number) => ({ direction: ItemDirection.OUT, lineTotal });
const inn = (lineTotal: number) => ({ direction: ItemDirection.IN, lineTotal });

describe('allocatePoints', () => {
  it('gives the whole amount to a single line', () => {
    const lines = [out(500_000)];
    expect([...allocatePoints(100_000, lines).values()]).toEqual([100_000]);
  });

  it('splits evenly and lands the rounding drift on the last line', () => {
    const lines = [out(100), out(100), out(100)];
    const alloc = [...allocatePoints(100_000, lines).values()];

    expect(alloc).toEqual([33_333.33, 33_333.33, 33_333.34]);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(100_000);
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
