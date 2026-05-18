import { DirectionTabs } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/DirectionTabs/DirectionTabs";
import { AddLineRow } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/AddLineRow/AddLineRow";
import { ToolbarActionBar } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/ToolbarActionBar/ToolbarActionBar";
import { WarehouseFilterRow } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/WarehouseFilterRow/WarehouseFilterRow";

export function FastStockTransferToolbar() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <DirectionTabs />
        <ToolbarActionBar />
      </div>
      <div className="space-y-3">
        <WarehouseFilterRow />
        <div className="flex flex-col gap-1">
          <AddLineRow />
        </div>
      </div>
    </div>
  );
}
