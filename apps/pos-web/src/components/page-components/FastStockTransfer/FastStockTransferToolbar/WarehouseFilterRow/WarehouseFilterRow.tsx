import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferData } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data";
import type { InventoryLocationPickerOption } from "@erp/pos/interfaces/inventory-location.interface";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

export function WarehouseFilterRow() {
  const filters = usePosFastStockTransferWorkflowStore((s) => s.filters);
  const { sourceWarehouseOptions, destinationWarehouseOptions } =
    useFastStockTransferData();
  const { setFilter } = useFastStockTransferActions();

  const selectedSource = sourceWarehouseOptions.find(
    (o) => o.id === filters.sourceWarehouse,
  );
  const selectedDestination = destinationWarehouseOptions.find(
    (o) => o.id === filters.destinationWarehouse,
  );

  return (
    <div className="flex flex-wrap gap-4">
      <PosFormItem
        label="Kho xuất"
        layout="horizontal"
        className="w-1/4 pr-3"
        labelClassName="w-1/3"
      >
        <PosSelect<InventoryLocationPickerOption>
          value={selectedSource ?? null}
          onChange={(option) => setFilter("sourceWarehouse", option?.id ?? "")}
          items={sourceWarehouseOptions}
          itemKey={(o) => o.id}
          renderItem={(o) => o.name}
          placeholder="Chọn kho xuất"
          disabled
        />
      </PosFormItem>
      <PosFormItem
        label="Kho nhập"
        layout="horizontal"
        className="w-1/4 pr-3"
        labelClassName="w-1/3"
      >
        <PosSelect<InventoryLocationPickerOption>
          value={selectedDestination ?? null}
          onChange={(option) =>
            setFilter("destinationWarehouse", option?.id ?? "")
          }
          items={destinationWarehouseOptions}
          itemKey={(o) => o.id}
          renderItem={(o) => o.name}
          placeholder="Chọn kho nhập"
          disabled
        />
      </PosFormItem>
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
