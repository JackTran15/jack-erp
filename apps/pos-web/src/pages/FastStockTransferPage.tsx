import { FastStockTransferDialogs } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferDialogs/FastStockTransferDialogs";
import { FastStockTransferTable } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferTable/FastStockTransferTable";
import { FastStockTransferToolbar } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/FastStockTransferToolbar";
import { useFastStockTransferMount } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-mount";

export function FastStockTransferPage() {
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
