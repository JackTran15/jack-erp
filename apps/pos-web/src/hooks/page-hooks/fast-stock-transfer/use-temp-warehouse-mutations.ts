import {
  addLine,
  closeSession,
  transferLines,
  updateLine,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-api";
import { tempWarehouseQueryKeys } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/temp-warehouse-query-keys";
import type {
  AddLineResult,
  AddTempWarehouseLineBody,
  CloseSessionResult,
  TempWarehouseCloseMode,
  TransferLinesResult,
  TransferTempWarehouseLinesBody,
  UpdateLineResult,
  UpdateTempWarehouseLineBody,
} from "@erp/shared-interfaces";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

interface UpdateLineVars {
  lineId: string;
  body: UpdateTempWarehouseLineBody;
}

interface CloseSessionVars {
  sessionId: string;
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
    CloseSessionResult,
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
    void qc.invalidateQueries({ queryKey: tempWarehouseQueryKeys.all });
  };

  const refetchTempWarehouse = () =>
    qc.refetchQueries({ queryKey: tempWarehouseQueryKeys.all });

  const addLineMutation = useMutation<
    AddLineResult,
    Error,
    AddTempWarehouseLineBody
  >({
    mutationFn: (body) => addLine(body),
    onSuccess: revalidateTempWarehouse,
  });

  const updateLineMutation = useMutation<
    UpdateLineResult,
    Error,
    UpdateLineVars
  >({
    mutationFn: ({ lineId, body }) => updateLine(lineId, body),
    onSuccess: revalidateTempWarehouse,
  });

  const closeSessionMutation = useMutation<
    CloseSessionResult,
    Error,
    CloseSessionVars
  >({
    mutationFn: ({ sessionId, mode }) => closeSession(sessionId, mode),
  });

  const transferLinesMutation = useMutation<
    TransferLinesResult,
    Error,
    TransferLinesVars
  >({
    mutationFn: ({ sessionId, body }) => transferLines(sessionId, body),
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
