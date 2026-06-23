// Shared types + helpers for the goods-issue (Xuất kho) form dialog.
// Extracted from GoodsIssuePage so other screens can reuse the dialog in-place.

export type GoodsIssueStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

export type GoodsIssuePurposeUI =
  | "OTHER"
  | "SALE"
  | "TRANSFER_OUT"
  | "DISPOSAL"
  | "STOCK_TAKE";

export interface GoodsIssueLine {
  id: string;
  itemId: string;
  quantity: number | string;
  unitPrice?: number | string;
  lineTotal?: number | string;
  notes?: string;
  itemCode?: string;
  itemName?: string;
  warehouse?: string;
  position?: string;
  unit?: string;
  locationId?: string;
  location?: { id: string; code: string; name: string; storageId?: string } | null;
  item?: { id: string; code: string; name: string; unit?: string; purchasePrice?: number | string | null } | null;
}

export interface InstantAverageCost {
  unitCost: number;
}

export interface GoodsIssue {
  id: string;
  documentNumber?: string;
  customerId?: string;
  customerName?: string;
  providerId?: string | null;
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
  locationId: string;
  location?: { id: string; code: string; name: string; storageId?: string } | null;
  purpose?: GoodsIssuePurposeUI;
  reason?: string;
  reasonId?: string;
  reasonRef?: { id: string; code: string; name: string } | null;
  targetBranchId?: string;
  targetBranch?: { id: string; name: string } | null;
  referenceId?: string | null;
  referenceType?: string | null;
  status: GoodsIssueStatus;
  issueDate?: string;
  occurredAt?: string | null;
  notes?: string;
  deliverer?: string | null;
  references?: string[];
  documentType?: string;
  approvedBy?: string;
  approvedAt?: string;
  postedBy?: string;
  postedAt?: string;
  lines: GoodsIssueLine[];
  createdAt: string;
}

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

export interface InventoryItem {
  id: string;
  name: string;
  code: string;
  unit: string;
  /** Default purchase price (from item master) — used to auto-fill Đơn giá. */
  purchasePrice?: number | string | null;
}

export interface InventoryStorage {
  id: string;
  name: string;
  branchId: string;
  isMainStorage?: boolean;
}

/** Active branch id used as X-Branch-Id (set by api-axios from localStorage). */
export function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

export const PURPOSE_LABELS: Record<GoodsIssuePurposeUI, string> = {
  OTHER: "Xuất khác",
  SALE: "Phiếu xuất kho bán hàng",
  TRANSFER_OUT: "Điều chuyển đến cửa hàng khác",
  DISPOSAL: "Hủy hàng",
  STOCK_TAKE: "Phiếu xuất kho kiểm kê",
};

export const MANUAL_PURPOSES: GoodsIssuePurposeUI[] = [
  "OTHER",
  "TRANSFER_OUT",
  "DISPOSAL",
];

export interface BranchOption {
  id: string;
  name: string;
  address?: string | null;
}

export interface IssueReasonOption {
  id: string;
  code: string;
  name: string;
  purpose: "OTHER" | "DISPOSAL";
}
