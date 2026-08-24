import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  AddLineResult,
  AddTempWarehouseLineBody,
  CloseBranchSessionsResult,
  ListLinesNettedResult,
  ListLinesRawResult,
  PaginatedResponse,
  TempWarehouseCloseMode,
  TempWarehouseDirection,
  TempWarehousePublicUser,
  TempWarehouseSession,
  TransferLinesResult,
  TransferTempWarehouseLinesBody,
  UpdateLineResult,
  UpdateTempWarehouseLineBody,
} from "@erp/shared-interfaces";

import { TEMP_WAREHOUSE_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { tempWarehouseService } from "@erp/pos/services/temp-warehouse.service";

export function useTempWarehouseLines(
  branchId: string | null,
  direction: TempWarehouseDirection,
  enabled = true,
  includeTransferred = false,
): UseQueryResult<ListLinesRawResult, Error> {
  return useQuery({
    queryKey: TEMP_WAREHOUSE_KEYS.LINES(
      branchId ?? "",
      direction,
      includeTransferred,
    ),
    queryFn: () =>
      tempWarehouseService.listLinesRaw({
        branchId: branchId as string,
        direction,
        // When surfacing TRANSFERRED-by-sale rows the backend ignores status;
        // otherwise keep the ACTIVE working set.
        status: includeTransferred ? undefined : "ACTIVE",
        includeTransferred,
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
    queryKey: TEMP_WAREHOUSE_KEYS.LINES_NETTED(sessionId ?? "none"),
    queryFn: () => {
      if (sessionId) {
        return tempWarehouseService.listNettedLines({ sessionId });
      }
      return tempWarehouseService.listNettedLines({
        branchId: branchId as string,
      });
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
    queryKey: TEMP_WAREHOUSE_KEYS.SESSION(sessionId ?? ""),
    queryFn: () => tempWarehouseService.getSession(sessionId as string),
    enabled: Boolean(sessionId) && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.transferProcessingStatus;
      if (status === "PENDING") return 1500;
      return false;
    },
  });
}

export function useTempWarehouseActiveSession(
  branchId: string | null,
  direction: TempWarehouseDirection,
): UseQueryResult<TempWarehouseSession | null, Error> {
  return useQuery({
    queryKey: TEMP_WAREHOUSE_KEYS.ACTIVE(branchId ?? "", direction),
    queryFn: () =>
      tempWarehouseService.getActiveSession(branchId as string, direction),
    enabled: Boolean(branchId),
    staleTime: 10_000,
  });
}

/**
 * 20 chứ không phải 50: dropdown chỉ cao 288px, để 50 thì trang 2 gần như không
 * bao giờ được xin tới và phân trang cuộn thành thứ có mà không chạy.
 */
export const TEMP_WAREHOUSE_CARRIERS_PAGE_SIZE = 20;

/**
 * Người vận chuyển = user active **được gán chi nhánh** đang chọn
 * (`GET /inventory/temp-warehouse/carriers`, resolve qua `user_branch_assignments`).
 * `id` là id tài khoản, nên `carrierUserId` trên line resolve ngược lại đúng
 * người. Tìm kiếm và phân trang do server làm — theo tên, email và mã nhân viên.
 */
export async function fetchTempWarehouseCarriers(
  branchId: string,
  search = "",
  page = 1,
  pageSize = TEMP_WAREHOUSE_CARRIERS_PAGE_SIZE,
): Promise<PaginatedResponse<TempWarehousePublicUser>> {
  return tempWarehouseService.listCarriers({
    branchId,
    search,
    pagination: { page, pageSize },
  });
}

export function useSearchTempWarehouseCarriers() {
  const queryClient = useQueryClient();
  return useCallback(
    (branchId: string, search: string, page = 1) => {
      const normalizedSearch = search.trim();
      return queryClient.fetchQuery({
        queryKey: TEMP_WAREHOUSE_KEYS.CARRIERS(
          branchId,
          normalizedSearch,
          page,
          TEMP_WAREHOUSE_CARRIERS_PAGE_SIZE,
        ),
        queryFn: () =>
          fetchTempWarehouseCarriers(branchId, normalizedSearch, page),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );
}

export function usePreloadTempWarehouseCarriers(
  branchId: string | null,
): UseQueryResult<PaginatedResponse<TempWarehousePublicUser>> {
  const keyBranchId = branchId ?? "";
  return useQuery({
    queryKey: TEMP_WAREHOUSE_KEYS.CARRIERS(
      keyBranchId,
      "",
      1,
      TEMP_WAREHOUSE_CARRIERS_PAGE_SIZE,
    ),
    queryFn: () => fetchTempWarehouseCarriers(keyBranchId, ""),
    enabled: Boolean(branchId),
    staleTime: 30_000,
  });
}

export function useInvalidateTempWarehouseCarriers() {
  const queryClient = useQueryClient();
  return useCallback(
    (branchId: string) =>
      queryClient.invalidateQueries({
        queryKey: ["temp-wh", "carriers", branchId] as const,
      }),
    [queryClient],
  );
}

interface UpdateLineVars {
  lineId: string;
  body: UpdateTempWarehouseLineBody;
}

interface CloseSessionVars {
  branchId: string;
  mode: TempWarehouseCloseMode;
}

interface TransferLinesVars {
  sessionId: string;
  body: TransferTempWarehouseLinesBody;
}

export interface UseTempWarehouseMutationsResult {
  addLineMutation: UseMutationResult<
    AddLineResult,
    Error,
    AddTempWarehouseLineBody
  >;
  updateLineMutation: UseMutationResult<
    UpdateLineResult,
    Error,
    UpdateLineVars
  >;
  closeSessionMutation: UseMutationResult<
    CloseBranchSessionsResult,
    Error,
    CloseSessionVars
  >;
  transferLinesMutation: UseMutationResult<
    TransferLinesResult,
    Error,
    TransferLinesVars
  >;
  revalidateTempWarehouse: () => void;
  refetchTempWarehouse: () => Promise<unknown>;
  branchId: string | null;
}

export function useTempWarehouseMutations(
  branchId: string | null,
): UseTempWarehouseMutationsResult {
  const qc = useQueryClient();

  const revalidateTempWarehouse = () => {
    void qc.invalidateQueries({ queryKey: TEMP_WAREHOUSE_KEYS.ALL });
  };

  const refetchTempWarehouse = () =>
    qc.refetchQueries({ queryKey: TEMP_WAREHOUSE_KEYS.ALL });

  const addLineMutation = useMutation<
    AddLineResult,
    Error,
    AddTempWarehouseLineBody
  >({
    mutationFn: (body) => tempWarehouseService.addLine(body),
    onSuccess: revalidateTempWarehouse,
  });

  const updateLineMutation = useMutation<
    UpdateLineResult,
    Error,
    UpdateLineVars
  >({
    mutationFn: ({ lineId, body }) =>
      tempWarehouseService.updateLine(lineId, body),
    onSuccess: revalidateTempWarehouse,
  });

  const closeSessionMutation = useMutation<
    CloseBranchSessionsResult,
    Error,
    CloseSessionVars
  >({
    mutationFn: ({ branchId: closeBranchId, mode }) =>
      tempWarehouseService.closeBranchSessions(closeBranchId, mode),
  });

  const transferLinesMutation = useMutation<
    TransferLinesResult,
    Error,
    TransferLinesVars
  >({
    mutationFn: ({ sessionId, body }) =>
      tempWarehouseService.transferLines(sessionId, body),
    onSuccess: revalidateTempWarehouse,
  });

  return {
    addLineMutation,
    updateLineMutation,
    closeSessionMutation,
    transferLinesMutation,
    revalidateTempWarehouse,
    refetchTempWarehouse,
    branchId,
  };
}
