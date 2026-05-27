/**
 * React Query key registry — xem CLAUDE.md mục 8.1. Tập trung tại 1 chỗ để
 * dễ invalidate by prefix (e.g. invalidate `INVOICE_KEYS.DRAFTS_PREFIX` sẽ
 * ăn mọi `INVOICE_KEYS.DRAFTS(sessionId)` con) và tránh trùng key.
 */
import type { TempWarehouseDirection } from "@erp/shared-interfaces";
import type { PosProductKind } from "@erp/pos/types/catalog.type";

export const ACCOUNT_KEYS = {
  ALL: ["accounts"] as const,
  PAYMENT: ["accounts", "payment"] as const,
  REVENUE: ["accounts", "revenue"] as const,
  RECEIVABLE: ["accounts", "receivable"] as const,
} as const;

export const INVOICE_KEYS = {
  ALL: ["invoices"] as const,
  DRAFTS_PREFIX: ["invoices", "drafts"] as const,
  DRAFTS: (sessionId: string) =>
    ["invoices", "drafts", sessionId] as const,
  DETAIL: (id: string) => ["invoices", "detail", id] as const,
  /** Hóa đơn đã bán có thể đổi/trả (trang return-goods). */
  RETURNABLE: (filters: Record<string, unknown>) =>
    ["invoices", "returnable", filters] as const,
  /** Danh sách dòng hàng được phép trả của một hóa đơn gốc. */
  ELIGIBLE_RETURNS: (id: string) =>
    ["invoices", "eligible-returns", id] as const,
} as const;

export const CUSTOMER_KEYS = {
  ALL: ["customers"] as const,
  DETAIL: (id: string) => ["customers", id] as const,
  LIST: (params: { page?: number; pageSize?: number } = {}) =>
    ["customers", "list", params] as const,
  SEARCH: (query: string) => ["customers", "search", query] as const,
  PURCHASE_HISTORY: (customerId: string) =>
    ["customers", "purchase-history", customerId] as const,
} as const;

export const CATALOG_KEYS = {
  ALL: ["catalog"] as const,
  LIST: (branchId: string) => ["catalog", branchId] as const,
  PRODUCT_DETAIL: (branchId: string, id: string, kind?: PosProductKind) =>
    ["catalog", "product-detail", branchId, id, kind ?? "auto"] as const,
} as const;

export const CUSTOMER_GROUP_KEYS = {
  ALL: ["customer-groups"] as const,
} as const;

export const INVENTORY_KEYS = {
  SHOWROOMS: (branchId: string) => ["inventory-showrooms", branchId] as const,
  STORAGES: (branchId: string) => ["inventory-storages", branchId] as const,
} as const;

export const TEMP_WAREHOUSE_KEYS = {
  ALL: ["temp-wh"] as const,
  ACTIVE: (branchId: string) => ["temp-wh", "active", branchId] as const,
  LINES: (branchId: string, direction: TempWarehouseDirection) =>
    ["temp-wh", "lines", branchId, direction] as const,
  LINES_NETTED: (sessionId: string) =>
    ["temp-wh", "lines-netted", sessionId] as const,
  SESSION: (sessionId: string) => ["temp-wh", "session", sessionId] as const,
  CARRIERS: (
    branchId: string,
    search: string,
    page: number,
    pageSize: number,
  ) => ["temp-wh", "carriers", branchId, search, page, pageSize] as const,
} as const;
