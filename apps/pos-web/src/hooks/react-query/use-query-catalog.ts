import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  CATALOG_KEYS,
  POS_BRANCH_CATALOG_KEYS,
} from "@erp/pos/constants/react-query-key.constant";
import type {
  PosCatalogLine,
  PosCatalogSearchResult,
  PosProductDetail,
  PosProductListResponse,
} from "@erp/pos/interfaces/catalog.interface";
import {
  catalogService,
  type SearchCatalogParams,
} from "@erp/pos/services/catalog.service";
import type { PosProductKind } from "@erp/pos/types/catalog.type";
import { useQueryClient } from "@tanstack/react-query";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";
import { useCallback } from "react";

/**
 * Tồn kho bán tại quầy theo chi nhánh — `GET /pos/branches/:id/catalog`.
 *
 * Mọi component đọc catalog đi qua hook này (qua `useCheckoutCatalog`);
 * React Query dedupe theo `CATALOG_KEYS.LIST(branchId)` nên dù gọi ở nhiều
 * nơi vẫn chỉ phát đúng 1 request. Tắt khi chưa có branch.
 */
export function useCatalogQuery(
  branchId: string,
): UseQueryResult<PosCatalogLine[], Error> {
  return useQuery<PosCatalogLine[], Error>({
    queryKey: CATALOG_KEYS.LIST(branchId),
    queryFn: () => catalogService.fetch(branchId),
    enabled: Boolean(branchId),
    staleTime: 30_000,
  });
}

/**
 * Số product tải tối đa cho grid (1 trang, không phân trang thêm).
 * Bằng đúng mặc định của `PaginationQueryDto.pageSize` phía server — trước đây
 * frontend ghi đè thành 30 mà không có lý do ghi lại.
 */
export const POS_CATALOG_PRODUCTS_PAGE_SIZE = 20;

/**
 * Danh sách catalog mức PRODUCT cho grid — `GET /pos/branches/:id/catalog/products`.
 * Tải 1 trang (`POS_CATALOG_PRODUCTS_PAGE_SIZE`). Lọc và tìm kiếm chạy TRÊN SERVER:
 * `categoryId` và `search` đều đi vào request lẫn `queryKey`. Tắt khi chưa có branch.
 */
export function useCatalogProductsQuery(
  branchId: string,
  categoryId?: string,
  search?: string,
): UseQueryResult<PosProductListResponse, Error> {
  // Chuẩn hoá một lần ở đây để khoá và request không thể lệch nhau.
  const term = search?.trim() || undefined;
  return useQuery<PosProductListResponse, Error>({
    queryKey: CATALOG_KEYS.PRODUCTS(branchId, categoryId, term),
    queryFn: () =>
      catalogService.listProducts(branchId, {
        page: 1,
        pageSize: POS_CATALOG_PRODUCTS_PAGE_SIZE,
        categoryId,
        search: term,
      }),
    enabled: Boolean(branchId),
    staleTime: 30_000,
  });
}

/**
 * Chi tiết product (gom biến thể) cho dialog chọn variant —
 * `GET /pos/branches/:id/catalog/products/:id`. Chỉ fetch khi dialog mở
 * (`enabled`) và có đủ `branchId` + `id`.
 */
export function useCatalogProductDetailQuery(
  branchId: string,
  id: string | null,
  kind: PosProductKind | undefined,
  enabled: boolean,
): UseQueryResult<PosProductDetail, Error> {
  return useQuery<PosProductDetail, Error>({
    queryKey: CATALOG_KEYS.PRODUCT_DETAIL(branchId, id ?? "", kind),
    queryFn: () =>
      catalogService.getProductDetail({ branchId, id: id as string, kind }),
    enabled: enabled && Boolean(branchId) && Boolean(id),
    staleTime: 30_000,
  });
}

export const POS_CATALOG_QUERY_LIMIT = 40;

export function fetchPosBranchCatalog(
  branchId: string,
  direction: PosCatalogDirection,
  search = "",
): Promise<PosCatalogLine[]> {
  return catalogService
    .fetch(branchId, search.trim() || undefined, direction)
    .then((rows) => rows.slice(0, POS_CATALOG_QUERY_LIMIT));
}

export function useSearchPosBranchCatalog() {
  const queryClient = useQueryClient();
  return useCallback(
    (branchId: string, direction: PosCatalogDirection, search: string) => {
      const normalizedSearch = search.trim();
      return queryClient.fetchQuery({
        queryKey: POS_BRANCH_CATALOG_KEYS.LIST(
          branchId,
          direction,
          normalizedSearch,
        ),
        queryFn: () =>
          fetchPosBranchCatalog(branchId, direction, normalizedSearch),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );
}

export function useInvalidatePosBranchCatalog() {
  const queryClient = useQueryClient();
  return useCallback(
    (branchId: string, direction: PosCatalogDirection) =>
      queryClient.invalidateQueries({
        queryKey: POS_BRANCH_CATALOG_KEYS.PREFIX(branchId, direction),
      }),
    [queryClient],
  );
}

/**
 * Imperative exact-match lookup mã vạch/SKU — `GET /pos/branches/:id/catalog/lookup`.
 * Trả callback `(branchId, code) => Promise<PosCatalogLine[]>` để ô tìm hàng
 * gọi mỗi lần đổi input / Enter; cache theo `CATALOG_KEYS.LOOKUP` nên quét lại
 * cùng mã không phát request thừa trong staleTime.
 */
export function useLookupCatalogByCode() {
  const queryClient = useQueryClient();
  return useCallback(
    (
      branchId: string,
      code: string,
      includeUntracked = false,
    ): Promise<PosCatalogLine[]> =>
      queryClient.fetchQuery({
        queryKey: CATALOG_KEYS.LOOKUP(branchId, code, includeUntracked),
        queryFn: () =>
          catalogService.lookupByCode(branchId, code, includeUntracked),
        staleTime: 30_000,
      }),
    [queryClient],
  );
}

/**
 * Imperative server-side catalog search (name / SKU / mã vạch ILIKE) —
 * `GET /pos/branches/:id/catalog?search=`. Trả callback `(branchId, term) =>
 * Promise<PosCatalogLine[]>` để ô tìm hàng gọi mỗi lần đổi input; cache theo
 * `CATALOG_KEYS.SEARCH` nên gõ lại cùng từ khóa không phát request thừa.
 */
export function useSearchCatalog() {
  const queryClient = useQueryClient();
  return useCallback(
    (
      branchId: string,
      term: string,
      includeUntracked = false,
    ): Promise<PosCatalogLine[]> =>
      queryClient.fetchQuery({
        queryKey: CATALOG_KEYS.SEARCH(branchId, term, includeUntracked),
        queryFn: () =>
          catalogService.fetch(branchId, term, undefined, includeUntracked),
        staleTime: 30_000,
      }),
    [queryClient],
  );
}

/** Số dòng gợi ý xin về mỗi lượt gõ. Server kẹp trần ở 100. */
export const POS_CATALOG_SEARCH_LIMIT = 20;

/**
 * Endpoint gộp — `GET /pos/branches/:id/catalog/search`. Một lượt gọi thay cho
 * `useLookupCatalogByCode` + `useSearchCatalog` chạy nối tiếp.
 *
 * Trả callback imperative vì ô tìm hàng gọi theo sự kiện (debounce / Enter),
 * không theo vòng đời component. Cache theo `CATALOG_KEYS.SEARCH_V2` nên gõ lại
 * cùng chuỗi trong `staleTime` không phát request thừa.
 */
export function useSearchPosCatalog() {
  const queryClient = useQueryClient();
  return useCallback(
    (
      branchId: string,
      params: SearchCatalogParams,
    ): Promise<PosCatalogSearchResult> => {
      const mode = params.mode ?? "full";
      const view = params.view ?? "full";
      return queryClient.fetchQuery({
        queryKey: CATALOG_KEYS.SEARCH_V2(
          branchId,
          params.q,
          mode,
          view,
          params.limit,
          params.includeUntracked ?? false,
        ),
        queryFn: () =>
          catalogService.search(branchId, { ...params, mode, view }),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );
}

/**
 * Tồn tại chi nhánh của các item đang nằm trong giỏ —
 * `POST /pos/branches/:id/catalog/stock`.
 *
 * Dùng `useQuery` chứ không phải `fetchQuery` imperative như đường tìm kiếm: đây là
 * dữ liệu phái sinh từ state giỏ, cần theo dõi liên tục, không theo sự kiện gõ.
 *
 * Giỏ rỗng thì **không gọi gì** (`enabled`). Đó là ca hay gặp nhất — mở trang với giỏ
 * trống — và thay một request 3 835 kB bằng một request 0 phần tử vẫn là một
 * round-trip cho hư không. Server cũng từ chối `itemIds: []` bằng 400, nên hai lớp
 * cùng nói một điều.
 */
export function useCatalogStockQuery(
  branchId: string,
  itemIds: readonly string[],
): UseQueryResult<PosCatalogLine[], Error> {
  return useQuery<PosCatalogLine[], Error>({
    queryKey: CATALOG_KEYS.STOCK(branchId, itemIds),
    queryFn: () => catalogService.stockForItems(branchId, [...itemIds]),
    enabled: Boolean(branchId) && itemIds.length > 0,
    staleTime: 30_000,
  });
}
