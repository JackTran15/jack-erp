import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferData } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data";
import type { InventoryLocationPickerOption } from "@erp/pos/interfaces/inventory-location.interface";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";
import { TempWarehouseDirection } from "@erp/shared-interfaces";

export function WarehouseFilterRow() {
  const filters = usePosFastStockTransferWorkflowStore((s) => s.filters);
  const { sourceWarehouseOptions, destinationWarehouseOptions, storages, direction } =
    useFastStockTransferData();
  const { setFilter } = useFastStockTransferActions();

  const selectedSource = sourceWarehouseOptions.find(
    (o) => o.id === filters.sourceWarehouse,
  );
  const selectedDestination = destinationWarehouseOptions.find(
    (o) => o.id === filters.destinationWarehouse,
  );

  // The showroom side is always fixed; only the storage side is selectable,
  // and only when the branch has more than one storage to choose from.
  const isOutbound =
    direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
  const canPickStorage = storages.length >= 2;
  const sourceDisabled = isOutbound ? !canPickStorage : true;
  const destinationDisabled = isOutbound ? true : !canPickStorage;

  return (
    <div className="flex flex-wrap gap-4">
      <PosSelect<InventoryLocationPickerOption>
        label="Kho xuất"
        fieldLayout="horizontal"
        fieldClassName="w-1/4 pr-3"
        labelClassName="w-1/3"
        value={selectedSource ?? null}
        onChange={(option) => setFilter("sourceWarehouse", option?.id ?? "")}
        items={sourceWarehouseOptions}
        itemKey={(o) => o.id}
        renderItem={(o) => o.name}
        placeholder="Chọn kho xuất"
        disabled={sourceDisabled}
      />
      <PosSelect<InventoryLocationPickerOption>
        label="Kho nhập"
        fieldLayout="horizontal"
        fieldClassName="w-1/4 pr-3"
        labelClassName="w-1/3"
        value={selectedDestination ?? null}
        onChange={(option) =>
          setFilter("destinationWarehouse", option?.id ?? "")
        }
        items={destinationWarehouseOptions}
        itemKey={(o) => o.id}
        renderItem={(o) => o.name}
        placeholder="Chọn kho nhập"
        disabled={destinationDisabled}
      />
      <div className="flex w-1/4 items-center pr-3">
        <PosCheckbox
          checked={filters.showRowsNeedingReview}
          onChange={(value) => setFilter("showRowsNeedingReview", value)}
          label="Hiển thị dòng cần kiểm tra"
        />
      </div>
    </div>
  );
}
