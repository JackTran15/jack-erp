import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  CATALOG_KEYS,
  POS_BRANCH_CATALOG_KEYS,
} from "@erp/pos/constants/react-query-key.constant";
import type {
  PosCatalogLine,
  PosProductDetail,
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
