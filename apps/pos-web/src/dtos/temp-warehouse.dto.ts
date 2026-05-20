import type {
  PaginationQuery,
  TempWarehouseDirection,
} from "@erp/shared-interfaces";

export interface ListLinesParams {
  branchId?: string;
  sessionId?: string;
  direction?: TempWarehouseDirection;
  status?: "ACTIVE" | "DELETED" | "AUTO_BALANCED" | "ALL";
  pagination?: PaginationQuery;
}

export interface ListNettedLinesParams {
  branchId?: string;
  sessionId?: string;
  hideBalanced?: boolean;
}

export interface ListCarriersParams {
  branchId: string;
  search?: string;
  pagination?: PaginationQuery;
}
