import { CartState } from './cart-state';
import { aCart, aCartLine } from './__fixtures__/promotion-fixture';

/**
 * T-02-01 — `discountFreeLines` exists so that BR-002 can mean "not discounted
 * at all" without dragging `unclaimedLines` (and therefore condition
 * evaluation) along with it. These tests pin that separation: if someone later
 * "simplifies" the two into one method, the second block here goes red.
 */
describe('CartState', () => {
  const claimed = aCartLine({ lineId: 'claimed', unitPrice: 100_000 });
  const manual = aCartLine({ lineId: 'manual', unitPrice: 685_000, manualLineDiscount: 85_000 });
  const free = aCartLine({ lineId: 'free', unitPrice: 200_000 });

  function stateWithClaim(): CartState {
    const state = new CartState();
    state.claimLines([claimed.lineId], 'earlier-program');
    return state;
  }

  describe('discountFreeLines', () => {
    it('drops both claimed lines and hand-discounted lines', () => {
      const cart = aCart({ lines: [claimed, manual, free] });

      expect(stateWithClaim().discountFreeLines(cart).map((l) => l.lineId)).toEqual(['free']);
    });

    it('drops a line that is both claimed and hand-discounted exactly once (A-05)', () => {
      const both = aCartLine({ lineId: 'both', unitPrice: 685_000, manualLineDiscount: 85_000 });
      const cart = aCart({ lines: [both, free] });
      const state = new CartState();
      state.claimLines([both.lineId], 'earlier-program');

      // The union must not swallow `free` as collateral, which is what a
      // double-exclusion bug would look like from the outside.
      expect(state.discountFreeLines(cart).map((l) => l.lineId)).toEqual(['free']);
    });

    it('treats a zero or absent manual discount as not discounted (A-07)', () => {
      const zero = aCartLine({ lineId: 'zero', manualLineDiscount: 0 });
      const absent = aCartLine({ lineId: 'absent' });
      const cart = aCart({ lines: [zero, absent] });

      expect(new CartState().discountFreeLines(cart).map((l) => l.lineId)).toEqual(['zero', 'absent']);
    });

    it('returns every line when nothing has been claimed or hand-discounted', () => {
      const cart = aCart({ lines: [free, aCartLine({ lineId: 'free-2' })] });

      expect(new CartState().discountFreeLines(cart)).toHaveLength(2);
    });
  });

  describe('unclaimedLines stays blind to manual discounts (ADR-02)', () => {
    it('keeps a hand-discounted line, because condition evaluation still counts it', () => {
      const cart = aCart({ lines: [claimed, manual, free] });

      // The whole point of the split: this list still contains `manual`.
      expect(stateWithClaim().unclaimedLines(cart).map((l) => l.lineId)).toEqual(['manual', 'free']);
    });
  });
});
