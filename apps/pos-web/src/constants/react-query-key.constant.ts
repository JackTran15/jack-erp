/**
 * React Query key registry — xem CLAUDE.md mục 8.1. Tập trung tại 1 chỗ để
 * dễ invalidate by prefix (e.g. invalidate `INVOICE_KEYS.DRAFTS_PREFIX` sẽ
 * ăn mọi `INVOICE_KEYS.DRAFTS(sessionId)` con) và tránh trùng key.
 */
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";
import type { TempWarehouseDirection } from "@erp/shared-interfaces";
import type { PosProductKind } from "@erp/pos/types/catalog.type";

export const USER_KEYS = {
  ME: ["user", "me"] as const,
} as const;

export const BRANCH_KEYS = {
  MY_BRANCHES: ["branches", "me"] as const,
} as const;

export const ORGANIZATION_KEYS = {
  ALL: ["organization"] as const,
  POS_SETTINGS: ["organization", "pos-settings"] as const,
} as const;

export const ACCOUNT_KEYS = {
  ALL: ["accounts"] as const,
  PAYMENT: ["accounts", "payment"] as const,
  REVENUE: ["accounts", "revenue"] as const,
  RECEIVABLE: ["accounts", "receivable"] as const,
} as const;

export const INVOICE_KEYS = {
  ALL: ["invoices"] as const,
  /** Danh sách hóa đơn (trang `/invoices`) — gồm cả bán/trả/đổi. */
  LIST: (filters: Record<string, unknown>) =>
    ["invoices", "list", filters] as const,
  DRAFTS_PREFIX: ["invoices", "drafts"] as const,
  DRAFTS: (sessionId: string) => ["invoices", "drafts", sessionId] as const,
  /** Tìm kiếm hóa đơn lưu tạm server-side qua POST /v2/invoices/drafts/search. */
  DRAFTS_SEARCH: (body: Record<string, unknown>) =>
    ["invoices", "drafts", "search", body] as const,
  DETAIL: (id: string) => ["invoices", "detail", id] as const,
  /** Tìm kiếm hóa đơn server-side qua POST /v2/invoices/search. */
  SEARCH_V2: (body: Record<string, unknown>) =>
    ["invoices", "search-v2", body] as const,
  /** Hóa đơn đã bán có thể đổi/trả (trang return-goods). */
  RETURNABLE: (filters: Record<string, unknown>) =>
    ["invoices", "returnable", filters] as const,
  /** Danh sách dòng hàng được phép trả của một hóa đơn gốc. */
  ELIGIBLE_RETURNS: (id: string) =>
    ["invoices", "eligible-returns", id] as const,
  /** Dư nợ còn lại của hóa đơn gốc — dùng cho khối xem trước khoản tách. */
  OUTSTANDING_DEBT: (id: string) =>
    ["invoices", "outstanding-debt", id] as const,
} as const;

export const CUSTOMER_KEYS = {
  ALL: ["customers"] as const,
  DETAIL: (id: string) => ["customers", id] as const,
  LIST: (params: { page?: number; pageSize?: number } = {}) =>
    ["customers", "list", params] as const,
  SEARCH: (query: string) => ["customers", "search", query] as const,
  PURCHASE_HISTORY: (
    customerId: string,
    filters: Record<string, unknown> = {},
  ) => ["customers", "purchase-history", customerId, filters] as const,
  /** `GET /invoices/customers/:id/debts` — sổ công nợ của một khách. */
  DEBTS: (customerId: string) => ["customers", customerId, "debts"] as const,
  /** `GET /customers/:id/summary` — tổng chi tiêu + công nợ + thẻ thành viên. */
  SUMMARY: (id: string) => ["customers", id, "summary"] as const,
  /** `GET /customers/:id/membership-card`. */
  MEMBERSHIP_CARD: (id: string) =>
    ["customers", id, "membership-card"] as const,
  /** `GET /customers/membership-card-types` — danh sách loại thẻ trong org. */
  MEMBERSHIP_CARD_TYPES: ["customers", "membership-card-types"] as const,
} as const;

export const SALES_HIERARCHY_KEYS = {
  ALL: ["sales-hierarchy"] as const,
  /** `GET /branches/:id/salesmen` — nhân viên bán hàng được gán cho chi nhánh. */
  SALESMEN: (branchId: string) =>
    ["sales-hierarchy", "salesmen", branchId] as const,
} as const;

export const CATALOG_KEYS = {
  ALL: ["catalog"] as const,
  LIST: (branchId: string) => ["catalog", branchId] as const,
  // `search` là một phần khoá, không phải tham số phụ: thiếu nó thì TanStack Query
  // trả cache của từ khoá trước và lưới đứng im — trông y hệt "server không lọc".
  // Chuỗi rỗng và `undefined` phải cho cùng một khoá, để xoá ô tìm là quay về đúng
  // cache của lần chưa tìm.
  PRODUCTS: (branchId: string, categoryId?: string, search?: string) =>
    [
      "catalog",
      "products",
      branchId,
      categoryId ?? "all",
      search?.trim() || "none",
    ] as const,
  PRODUCT_DETAIL: (branchId: string, id: string, kind?: PosProductKind) =>
    ["catalog", "product-detail", branchId, id, kind ?? "auto"] as const,
  LOOKUP: (branchId: string, code: string, includeUntracked = false) =>
    ["catalog", "lookup", branchId, code, includeUntracked] as const,
  /**
   * Tồn của một tập item đã biết — `POST /catalog/stock`.
   *
   * Key dựng từ **nội dung** mảng (sort + join), không từ reference: giỏ hàng đổi
   * reference mỗi lần sửa số lượng, và một key mới mỗi render sẽ biến hook đồng bộ
   * tồn thành vòng lặp request.
   */
  STOCK: (branchId: string, itemIds: readonly string[]) =>
    ["catalog", "stock", branchId, [...itemIds].sort().join(",")] as const,
  /** Tìm kiếm catalog server-side (name/SKU/mã vạch ILIKE) cho dropdown gợi ý. */
  SEARCH: (branchId: string, term: string, includeUntracked = false) =>
    ["catalog", "search", branchId, term, includeUntracked] as const,
  /**
   * Endpoint gộp `GET /catalog/search` — tra khớp tuyệt đối + gợi ý trong 1 lượt.
   *
   * Key riêng chứ KHÔNG dùng lại `SEARCH`: hai endpoint trả hai shape khác nhau
   * (`PosCatalogLine[]` vs `PosCatalogSearchResult`), dùng chung một entry cache
   * là đưa shape này cho consumer của shape kia. `mode`/`view` nằm trong key vì
   * chúng đổi cả nội dung lẫn hình dạng kết quả.
   *
   * `limit` cũng phải nằm trong key, và đây là bài học từ một lần đo thật: ô tìm
   * gọi `limit=20` (dropdown), `addProductByQuery` gọi `limit=2` (chỉ cần đếm
   * 0/1/nhiều) — cùng chuỗi, cùng mode, cùng view. Thiếu `limit` thì lời gọi thứ
   * hai im lặng nhận lại 20 dòng đã cache thay vì hỏi lại, và một caller tương
   * lai xin `limit=5` sẽ nhận nhầm mà không có dấu hiệu gì.
   */
  SEARCH_V2: (
    branchId: string,
    term: string,
    mode: string,
    view: string,
    limit: number | undefined,
    includeUntracked = false,
  ) =>
    [
      "catalog",
      "search-v2",
      branchId,
      term,
      mode,
      view,
      limit ?? "default",
      includeUntracked,
    ] as const,
} as const;

export const ITEM_CATEGORY_KEYS = {
  ALL: ["item-categories"] as const,
  LIST: (params: Record<string, unknown>) =>
    ["item-categories", "list", params] as const,
  TREE: (params: Record<string, unknown>) =>
    ["item-categories", "tree", params] as const,
} as const;

export const CUSTOMER_GROUP_KEYS = {
  ALL: ["customer-groups"] as const,
} as const;

export const INVENTORY_KEYS = {
  SHOWROOMS: (branchId: string) => ["inventory-showrooms", branchId] as const,
  STORAGES: (branchId: string) => ["inventory-storages", branchId] as const,
} as const;

export const POS_BRANCH_CATALOG_KEYS = {
  PREFIX: (branchId: string, direction: PosCatalogDirection) =>
    ["pos-branch-catalog", branchId, direction] as const,
  LIST: (branchId: string, direction: PosCatalogDirection, search: string) =>
    ["pos-branch-catalog", branchId, direction, search] as const,
} as const;

export const DAILY_REPORT_KEYS = {
  ALL: ["daily-report"] as const,
  /** `POST /reports/pos/daily-summary` — tab Tổng hợp. */
  SUMMARY: (body: Record<string, unknown>) =>
    ["daily-report", "summary", body] as const,
  /** `POST /reports/invoices/search` (revenue-by-item) — tab Doanh thu theo mặt hàng. */
  REVENUE_BY_ITEM: (body: Record<string, unknown>) =>
    ["daily-report", "revenue-by-item", body] as const,
  /** `GET /reports/invoices/filter-options` — Thu ngân / NVBH dropdowns. */
  FILTER_OPTIONS: (type: string, branchId: string) =>
    ["daily-report", "filter-options", type, branchId] as const,
  /** `POST /reports/pos/daily-summary/detail` — modal "xem chi tiết" trên tab Tổng hợp. */
  SUMMARY_DETAIL: (body: Record<string, unknown>) =>
    ["daily-report", "summary-detail", body] as const,
} as const;

export const TEMP_WAREHOUSE_KEYS = {
  ALL: ["temp-wh"] as const,
  ACTIVE: (branchId: string, direction: TempWarehouseDirection) =>
    ["temp-wh", "active", branchId, direction] as const,
  LINES: (
    branchId: string,
    direction: TempWarehouseDirection,
    includeTransferred = false,
  ) =>
    ["temp-wh", "lines", branchId, direction, includeTransferred] as const,
  LINES_NETTED: (sessionId: string) =>
    ["temp-wh", "lines-netted", sessionId] as const,
  LINES_TRANSFER_STATUS: (ids: ReadonlyArray<string>) =>
    ["temp-wh", "lines-transfer-status", ...ids] as const,
  SESSION: (sessionId: string) => ["temp-wh", "session", sessionId] as const,
  CARRIERS: (
    branchId: string,
    search: string,
    page: number,
    pageSize: number,
  ) => ["temp-wh", "carriers", branchId, search, page, pageSize] as const,
} as const;
