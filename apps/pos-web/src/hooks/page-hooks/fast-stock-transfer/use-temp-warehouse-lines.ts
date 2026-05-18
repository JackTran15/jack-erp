import { tempWarehouseQueryKeys } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/temp-warehouse-query-keys";
import {
  getSession,
  listLinesRaw,
  listNettedLines,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-api";
import {
  ListLinesNettedResult,
  ListLinesRawResult,
  TempWarehouseDirection,
  TempWarehouseSession,
} from "@erp/shared-interfaces";
import { UseQueryResult, useQuery } from "@tanstack/react-query";

export function useTempWarehouseLines(
  branchId: string | null,
  direction: TempWarehouseDirection,
  enabled = true,
): UseQueryResult<ListLinesRawResult, Error> {
  return useQuery({
    queryKey: tempWarehouseQueryKeys.lines(branchId ?? "", direction),
    queryFn: () =>
      listLinesRaw({
        branchId: branchId as string,
        direction,
        status: "ACTIVE",
        pagination: { page: 1, pageSize: 500 },
      }),
    enabled: Boolean(branchId) && enabled,
    staleTime: 5_000,
  });
}

export function useTempWarehouseNettedLines(
  branchId: string | null,
  sessionId: string | null | undefined,
): UseQueryResult<ListLinesNettedResult, Error> {
  return useQuery({
    queryKey: tempWarehouseQueryKeys.linesNetted(sessionId ?? "none"),
    queryFn: () => {
      if (sessionId) {
        return listNettedLines({ sessionId });
      }
      return listNettedLines({ branchId: branchId as string });
    },
    enabled: Boolean(branchId),
    staleTime: 5_000,
  });
}

export function useTempWarehouseSessionDetail(
  sessionId: string | null | undefined,
  enabled = false,
): UseQueryResult<TempWarehouseSession, Error> {
  return useQuery({
    queryKey: tempWarehouseQueryKeys.session(sessionId ?? ""),
    queryFn: () => getSession(sessionId as string),
    enabled: Boolean(sessionId) && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.transferProcessingStatus;
      if (status === "PENDING") return 1500;
      return false;
    },
  });
}
