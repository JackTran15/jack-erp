import { useEffect } from "react";

import { usePreloadTempWarehouseCarriers } from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";

export function useFastStockTransferPickerLoader(): void {
  const branchId = usePosBranchStore((s) => s.branchId);
  const upsertCarriers = usePosFastStockTransferPickerStore(
    (s) => s.upsertCarriers,
  );
  const { data } = usePreloadTempWarehouseCarriers(branchId);

  useEffect(() => {
    if (data?.data) upsertCarriers(data.data);
  }, [data, upsertCarriers]);
}
