import { CartContext, CartLine } from '../model/cart';

/**
 * Tracks which BR-001 resources have been claimed while the resolver walks
 * programs in priority order: cart lines (claimed by ITEM_DISCOUNT/TIERED_DISCOUNT),
 * the single gift slot (GIFT_ITEM/BUY_M_GET_N), and the single invoice-discount
 * slot (INVOICE_DISCOUNT).
 */
export class CartState {
  private readonly lineOwners = new Map<string, string>();
  private giftSlotOwnerId?: string;
  private invoiceDiscountOwnerId?: string;

  claimLines(lineIds: string[], programId: string): void {
    for (const lineId of lineIds) {
      this.lineOwners.set(lineId, programId);
    }
  }

  isLineClaimed(lineId: string): boolean {
    return this.lineOwners.has(lineId);
  }

  lineOwner(lineId: string): string | undefined {
    return this.lineOwners.get(lineId);
  }

  /**
   * Lines no line-level program has claimed. Used by `condition-evaluator` for
   * `calc_basis = NON_PROMO_ITEMS` — i.e. whether a program's *condition* is met.
   * Deliberately blind to manual discounts: see `discountFreeLines` below.
   */
  unclaimedLines(cart: CartContext): CartLine[] {
    return cart.lines.filter((line) => !this.isLineClaimed(line.lineId));
  }

  /**
   * BR-002 base for INVOICE_DISCOUNT: lines that have not been discounted *at
   * all* — neither claimed by a line-level program (ITEM_DISCOUNT /
   * TIERED_DISCOUNT) nor hand-discounted by the cashier at the till.
   *
   * Separate from `unclaimedLines` on purpose (ADR-02,
   * 2026091803-ctkm-item-discount-invoice-scope): that one also answers
   * "is this program's condition met?", and widening it here would silently
   * change condition evaluation for programs that have nothing to do with
   * invoice discounts. Two neighbouring meanings, two methods.
   *
   * The two exclusions are a union, so a line that is both claimed and
   * hand-discounted drops out once — never discounted twice over.
   */
  discountFreeLines(cart: CartContext): CartLine[] {
    return cart.lines.filter(
      (line) => !this.isLineClaimed(line.lineId) && (line.manualLineDiscount ?? 0) <= 0,
    );
  }

  claimGiftSlot(programId: string): void {
    this.giftSlotOwnerId = programId;
  }

  isGiftSlotTaken(): boolean {
    return this.giftSlotOwnerId !== undefined;
  }

  giftSlotOwner(): string | undefined {
    return this.giftSlotOwnerId;
  }

  claimInvoiceDiscount(programId: string): void {
    this.invoiceDiscountOwnerId = programId;
  }

  isInvoiceDiscountTaken(): boolean {
    return this.invoiceDiscountOwnerId !== undefined;
  }

  invoiceDiscountOwner(): string | undefined {
    return this.invoiceDiscountOwnerId;
  }
}
