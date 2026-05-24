import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { CATALOG_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { catalogService } from "@erp/pos/services/catalog.service";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";

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
