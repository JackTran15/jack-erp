import { FastStockTransferDialogs } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferDialogs/FastStockTransferDialogs";
import { FastStockTransferTable } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferTable/FastStockTransferTable";
import { FastStockTransferToolbar } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/FastStockTransferToolbar";
import { useFastStockTransferMount } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-mount";
import { useFastStockTransferPickerLoader } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-picker-loader";
import { useFastStockTransferPickerSync } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-picker-sync";

export function FastStockTransferPage() {
  useFastStockTransferPickerLoader();
  useFastStockTransferPickerSync();
  useFastStockTransferMount();

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
        <FastStockTransferToolbar />
        <FastStockTransferTable />
      </div>
      <FastStockTransferDialogs />
    </div>
  );
}
