import { useEffect, useMemo, useRef } from "react";

import {
  useTempWarehouseActiveSession,
  useTempWarehouseLines,
} from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import { catalogDirectionForTransfer } from "@erp/pos/lib/page-libs/fast-stock-transfer/picker-cache";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";
import {
  TempWarehouseDirection,
  TempWarehouseSessionStatus,
} from "@erp/shared-interfaces";

export function useFastStockTransferPickerSync(): void {
  const branchId = usePosBranchStore((s) => s.branchId);
  const direction = usePosFastStockTransferWorkflowStore((s) => s.direction);
  const syncFromLines = usePosFastStockTransferPickerStore(
    (s) => s.syncFromLines,
  );
  const setCatalogDirection = usePosFastStockTransferPickerStore(
    (s) => s.setCatalogDirection,
  );
  const clearProductCache = usePosFastStockTransferPickerStore(
    (s) => s.clearProductCache,
  );
  const setProductToolbar = usePosFastStockTransferPickerStore(
    (s) => s.setProductToolbar,
  );
  const setToolbarProduct = usePosFastStockTransferWorkflowStore(
    (s) => s.setToolbarProduct,
  );

  const { data: session } = useTempWarehouseActiveSession(branchId);
  const isSessionClosed = session?.status === TempWarehouseSessionStatus.CLOSED;

  const outboundQuery = useTempWarehouseLines(
    branchId,
    TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    !isSessionClosed,
  );
  const returnQuery = useTempWarehouseLines(
    branchId,
    TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
    !isSessionClosed,
  );

  const catalogDirection = useMemo(
    () => catalogDirectionForTransfer(direction),
    [direction],
  );

  const prevDirectionRef = useRef(catalogDirection);

  useEffect(() => {
    const prev = prevDirectionRef.current;
    if (prev !== catalogDirection) {
      clearProductCache();
      setToolbarProduct(null);
      setProductToolbar({ query: "" });
    }
    prevDirectionRef.current = catalogDirection;
    setCatalogDirection(catalogDirection);
  }, [
    catalogDirection,
    clearProductCache,
    setCatalogDirection,
    setProductToolbar,
    setToolbarProduct,
  ]);

  useEffect(() => {
    const lines = [
      ...(outboundQuery.data?.data ?? []),
      ...(returnQuery.data?.data ?? []),
    ];
    if (lines.length === 0) return;
    syncFromLines(lines);
  }, [outboundQuery.data?.data, returnQuery.data?.data, syncFromLines]);
}
