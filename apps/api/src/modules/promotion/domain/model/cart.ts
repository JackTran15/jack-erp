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
}
