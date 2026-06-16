import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  CATALOG_KEYS,
  POS_BRANCH_CATALOG_KEYS,
} from "@erp/pos/constants/react-query-key.constant";
import type {
  PosCatalogLine,
  PosProductDetail,
  PosProductListResponse,
} from "@erp/pos/interfaces/catalog.interface";
import { catalogService } from "@erp/pos/services/catalog.service";
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

/** Số product tải tối đa cho grid (1 trang, không phân trang thêm). */
export const POS_CATALOG_PRODUCTS_PAGE_SIZE = 30;

/**
 * Danh sách catalog mức PRODUCT cho grid — `GET /pos/branches/:id/catalog/products`.
 * Tải 1 trang (pageSize=100); ô tìm header lọc client-side trên kết quả này.
 * Dedupe theo `CATALOG_KEYS.PRODUCTS(branchId)`. Tắt khi chưa có branch.
 */
export function useCatalogProductsQuery(
  branchId: string,
  categoryId?: string,
): UseQueryResult<PosProductListResponse, Error> {
  return useQuery<PosProductListResponse, Error>({
    queryKey: CATALOG_KEYS.PRODUCTS(branchId, categoryId),
    queryFn: () =>
      catalogService.listProducts(branchId, {
        page: 1,
        pageSize: POS_CATALOG_PRODUCTS_PAGE_SIZE,
        categoryId,
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
    (branchId: string, code: string): Promise<PosCatalogLine[]> =>
      queryClient.fetchQuery({
        queryKey: CATALOG_KEYS.LOOKUP(branchId, code),
        queryFn: () => catalogService.lookupByCode(branchId, code),
        staleTime: 30_000,
      }),
    [queryClient],
  );
}
