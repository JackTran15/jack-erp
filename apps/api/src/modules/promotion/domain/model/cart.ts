import { CatalogItemView } from '../ports/catalog-reader.port';

export interface CartLine {
  /** Client-supplied, echoed back so the client can map results without guessing by order. */
  lineId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  /** Per-line discount the cashier already entered manually. */
  manualLineDiscount?: number;
}

export interface CartContext {
  organizationId: string;
  branchId: string;
  at: Date;
  customer?: { id: string; groupId?: string; birthDate?: Date; cardTierId?: string };
  lines: CartLine[];
  catalog: Map<string, CatalogItemView>;
  /** Ids of auto_apply=false programs the cashier picked manually. */
  selectedProgramIds: string[];
  /**
   * ADR-07 (pos-promotion-apply/03-logical-design.md) — ids to keep out of the
   * race entirely, filtered out of `eligible` before `selectedProgramIds` is
   * even consulted. Always "exclude", never "add" — the inverse of
   * `selectedProgramIds`. Wins on conflict if an id is in both.
   */
  excludedProgramIds: string[];
}
