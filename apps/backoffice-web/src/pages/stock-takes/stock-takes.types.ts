export type StockTakeStatus = "DRAFT" | "POSTED" | "CANCELLED";

export const STATUS_LABEL: Record<StockTakeStatus, string> = {
  DRAFT: "Chưa xử lý",
  POSTED: "Đã xử lý",
  CANCELLED: "Đã huỷ",
};

export interface StockTakeLine {
  id: string;
  itemId: string;
  locationId: string;
  expectedQty: string | number;
  countedQty: string | number | null;
  note?: string | null;
  reason?: string | null;
  item?: { id: string; code: string; name: string; unit: string };
  location?: { id: string; code: string; name: string };
}

export interface StockTake {
  id: string;
  documentNumber?: string;
  status: StockTakeStatus;
  storageId?: string | null;
  locationId?: string | null;
  purpose?: string | null;
  plannedDate?: string | null;
  countedAt?: string | null;
  conclusion?: string | null;
  snapshotAt: string;
  notes?: string;
  postedAt?: string | null;
  createdAt: string;
  generatedReceiptId?: string | null;
  generatedIssueId?: string | null;
  lines: StockTakeLine[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StorageOption {
  id: string;
  name: string;
  branchId: string;
}

export interface LocationOption {
  id: string;
  name: string;
  code: string;
  storageId: string;
}

export interface ItemOption {
  id: string;
  name: string;
  code: string;
  unit: string;
}
