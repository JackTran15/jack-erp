import { http } from "@erp/pos/lib/common/http";
import type { GetCatalogProductDetailParams } from "@erp/pos/dtos/catalog.dto";
import type {
  PosCatalogLine,
  PosCatalogSearchResult,
  PosProductDetail,
  PosProductListResponse,
} from "@erp/pos/interfaces/catalog.interface";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";

/** Tham số `GET /pos/branches/:id/catalog/search`. */
export interface SearchCatalogParams {
  q: string;
  /** `exact` bỏ hẳn nhánh gợi ý — đường quét mã vạch và phím Enter. */
  mode?: "exact" | "full";
  /** `suggest` cắt `locations[]` và `quantityOnHand` khỏi mỗi dòng gợi ý. */
  view?: "full" | "suggest";
  /** Trần số dòng gợi ý. Server kẹp ở 100; bỏ trống là 20. */
  limit?: number;
  includeUntracked?: boolean;
}

export interface ListCatalogProductsParams {
  direction?: PosCatalogDirection;
  page?: number;
  pageSize?: number;
  /** Lọc theo danh mục (inventory-item-categories). */
  categoryId?: string;
}

export const catalogService = {
  fetch: (
    branchId: string,
    search?: string,
    direction?: PosCatalogDirection,
    includeUntracked?: boolean,
  ): Promise<PosCatalogLine[]> => {
    const params = new URLSearchParams();
    if (search?.trim()) params.set("search", search.trim());
    if (direction) params.set("direction", direction);
    if (includeUntracked) params.set("includeUntracked", "true");
    const q = params.toString();
    const path = `/pos/branches/${encodeURIComponent(branchId)}/catalog${q ? `?${q}` : ""}`;
    return http.get<PosCatalogLine[]>(path);
  },

  /**
   * Tồn tại chi nhánh của một tập item đã biết —
   * `POST /pos/branches/:id/catalog/stock`.
   *
   * Dùng để làm tươi snapshot tồn của các dòng ĐANG trong giỏ, thay cho việc tải
   * cả catalog chi nhánh (10 400 item ≈ 3 835 kB trên bản restore prod) để tra ba
   * món. Trả ít phần tử hơn `itemIds` khi có món đã ngừng bán — caller giữ dòng đó
   * ở trạng thái chưa biết tồn, tức là cảnh báo vượt tồn vẫn bật.
   *
   * `POST` trả **201** (mặc định NestJS cho @Post), không phải 200 — đừng assert 200.
   */
  stockForItems: (
    branchId: string,
    itemIds: string[],
  ): Promise<PosCatalogLine[]> =>
    http.post<PosCatalogLine[]>(
      `/pos/branches/${encodeURIComponent(branchId)}/catalog/stock`,
      { itemIds },
    ),

  /**
   * Endpoint gộp — `GET /pos/branches/:id/catalog/search`. Một lượt gọi trả cả
   * `exact` (khớp mã tuyệt đối, để auto-add) lẫn `suggestions` (dropdown), thay
   * cho `lookupByCode` + `fetch` chạy nối tiếp như trước.
   */
  search: (
    branchId: string,
    params: SearchCatalogParams,
  ): Promise<PosCatalogSearchResult> => {
    const qs = new URLSearchParams({ q: params.q });
    if (params.mode) qs.set("mode", params.mode);
    if (params.view) qs.set("view", params.view);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.includeUntracked) qs.set("includeUntracked", "true");
    return http.get<PosCatalogSearchResult>(
      `/pos/branches/${encodeURIComponent(branchId)}/catalog/search?${qs.toString()}`,
    );
  },

  /**
   * Tra khớp tuyệt đối mã vạch / mã SKU — `GET /pos/branches/:id/catalog/lookup`.
   * Trả 0..n dòng (cùng shape catalog) để caller auto-add khi đúng 1 kết quả.
   */
  lookupByCode: (
    branchId: string,
    code: string,
    includeUntracked?: boolean,
  ): Promise<PosCatalogLine[]> => {
    const qs = new URLSearchParams({ code });
    if (includeUntracked) qs.set("includeUntracked", "true");
    return http.get<PosCatalogLine[]>(
      `/pos/branches/${encodeURIComponent(branchId)}/catalog/lookup?${qs.toString()}`,
    );
  },

  /**
   * Danh sách catalog mức PRODUCT (gom biến thể) — `GET /pos/branches/:id/
   * catalog/products`. Phân trang (pageSize ≤ 100), không có tham số search.
   */
  listProducts: (
    branchId: string,
    params: ListCatalogProductsParams = {},
  ): Promise<PosProductListResponse> => {
    const qs = new URLSearchParams();
    if (params.direction) qs.set("direction", params.direction);
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
    if (params.categoryId) qs.set("categoryId", params.categoryId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return http.get<PosProductListResponse>(
      `/pos/branches/${encodeURIComponent(branchId)}/catalog/products${suffix}`,
    );
  },

  /** Chi tiết product (gom biến thể) — `GET /pos/branches/:id/catalog/products/:id`. */
  getProductDetail: ({
    branchId,
    id,
    kind,
  }: GetCatalogProductDetailParams): Promise<PosProductDetail> => {
    const qs = kind ? `?kind=${kind}` : "";
    return http.get<PosProductDetail>(
      `/pos/branches/${encodeURIComponent(branchId)}/catalog/products/${encodeURIComponent(id)}${qs}`,
    );
  },
};
