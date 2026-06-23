// Shared types + helpers for the goods-receipt (Nhập kho) form dialog.
// Extracted from PurchaseOrdersPage so TransferInPage can reuse the dialog in-place.

export type GoodsReceiptStatus = "DRAFT" | "POSTED" | "CANCELLED" | "REVERSED";
export type GoodsReceiptPurpose = "OTHER" | "TRANSFER_IN" | "STOCK_TAKE";

export interface GoodsReceiptLine {
  id: string;
  itemId: string;
  locationId: string;
  binId?: string | null;
  uomCode: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal?: number | string;
  note?: string | null;
  /** Eager-loaded from BE — present on read endpoints. */
  item?: { id: string; code: string; name: string; unit?: string } | null;
  location?: {
    id: string;
    code: string;
    name: string;
    storageId?: string;
  } | null;
}

export interface GoodsReceipt {
  id: string;
  documentNumber?: string | null;
  status: GoodsReceiptStatus;
  purpose: GoodsReceiptPurpose;
  providerId?: string | null;
  providerName?: string;
  provider?: { id: string; code: string; name: string } | null;
  counterpartyKind?: "supplier" | "customer" | "employee" | null;
  counterpartyId?: string | null;
  /** Resolved "Đối tượng" inlined by the API for all kinds (NCC/KH/NV). */
  counterparty?: {
    kind: "supplier" | "customer" | "employee";
    id: string;
    code: string | null;
    name: string;
  } | null;
  deliveredBy?: string | null;
  reason?: string | null;
  description?: string | null;
  referenceId?: string | null;
  referenceType?: "PURCHASE_ORDER" | "STOCK_TRANSFER" | "STOCK_TAKE" | null;
  references?: string[];
  sourceBranchId?: string | null;
  receivedAt: string;
  locationId: string;
  location?: {
    id: string;
    code: string;
    name: string;
    storageId?: string;
  } | null;
  attachmentIds?: string[];
  lines: GoodsReceiptLine[];
  cashPaymentId?: string | null;
  cashReceiptId?: string | null;
  postedAt?: string | null;
  postedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Aliases for the existing component-internal names to keep diffs small. */
export type PurchaseOrderStatus = GoodsReceiptStatus;
export type PurchaseOrderLine = GoodsReceiptLine & {
  itemCode?: string;
  itemName?: string;
  warehouse?: string;
  position?: string;
  unit?: string;
};
export type PurchaseOrder = GoodsReceipt;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InventoryProvider {
  id: string;
  name: string;
  code: string;
}

export interface InventoryLocation {
  id: string;
  name: string;
  code: string;
  storageId: string;
  isUnassigned?: boolean;
}

export interface InventoryStorage {
  id: string;
  name: string;
  branchId: string;
  isMainStorage?: boolean;
}

/** Active branch — same source the axios client uses for the X-Branch-Id header. */
export function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

export interface InventoryItem {
  id: string;
  name: string;
  code: string;
  unit: string;
  /** Default purchase price (from item master) — used to auto-fill Đơn giá. */
  purchasePrice?: number | string | null;
}
