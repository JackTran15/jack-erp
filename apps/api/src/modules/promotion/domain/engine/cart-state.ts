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

  unclaimedLines(cart: CartContext): CartLine[] {
    return cart.lines.filter((line) => !this.isLineClaimed(line.lineId));
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
