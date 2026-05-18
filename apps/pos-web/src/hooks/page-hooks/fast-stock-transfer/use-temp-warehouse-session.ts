import { getActiveSession } from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-api";
import { TempWarehouseSession } from "@erp/shared-interfaces";
import { UseQueryResult, useQuery } from "@tanstack/react-query";
import { tempWarehouseQueryKeys } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/temp-warehouse-query-keys";

export function useTempWarehouseActiveSession(
  branchId: string | null,
): UseQueryResult<TempWarehouseSession | null, Error> {
  return useQuery({
    queryKey: tempWarehouseQueryKeys.active(branchId ?? ""),
    queryFn: () => getActiveSession(branchId as string),
    enabled: Boolean(branchId),
    staleTime: 10_000,
  });
}
