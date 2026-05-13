import { cn } from "@erp/ui";
import { PosFormItem } from "@erp/pos/components/form/PosFormItem";
import { PosSelect } from "@erp/pos/components/form/PosSelect";
import { PosTextInput } from "@erp/pos/components/form/PosTextInput";
import {
  FastStockTransferModeEnum,
  type FastStockTransferFilters,
} from "../types";
import { PosCheckbox } from "@erp/pos/components/form/PosCheckbox";

interface FastStockTransferToolbarProps {
  mode: FastStockTransferModeEnum;
  onModeChange: (mode: FastStockTransferModeEnum) => void;
  filters: FastStockTransferFilters;
  warehouseOptions: ReadonlyArray<string>;
  onFilterChange: <K extends keyof FastStockTransferFilters>(
    key: K,
    value: FastStockTransferFilters[K],
  ) => void;
  onAddRow: () => void;
  onResetData: () => void;
  onProcessTransfer: () => void;
  canProcessTransfer: boolean;
  canCloseTransfer: boolean;
}

const TAB_OPTIONS: Array<{ id: FastStockTransferModeEnum; label: string }> = [
  { id: FastStockTransferModeEnum.OUTBOUND, label: "Xuất đi" },
  { id: FastStockTransferModeEnum.RETURN, label: "Trả lại" },
];

export function FastStockTransferToolbar({
  mode,
  onModeChange,
  filters,
  warehouseOptions,
  onFilterChange,
  onAddRow,
  onResetData,
  onProcessTransfer,
  canProcessTransfer,
  canCloseTransfer,
}: FastStockTransferToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          {TAB_OPTIONS.map((tab) => {
            const active = tab.id === mode;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onModeChange(tab.id)}
                className={cn(
                  "relative py-1 text-[14px] font-semibold transition-colors",
                  active
                    ? "text-[#3B82F6]"
                    : "text-[#9CA3AF] hover:text-[#6B7280]",
                )}
              >
                {tab.label}
                {active ? (
                  <span className="absolute inset-x-0 -bottom-2 h-0.5 rounded bg-[#3B82F6]" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetData}
            className="inline-flex h-9 items-center rounded-md border border-[#C7D2FE] px-3 text-[13px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF]"
          >
            Lấy lại dữ liệu
          </button>
          <button
            type="button"
            onClick={onProcessTransfer}
            disabled={!canProcessTransfer}
            className={cn(
              "inline-flex h-9 items-center rounded-md px-3 text-[13px] font-semibold text-white",
              canProcessTransfer
                ? "bg-[#4F46E5] hover:bg-[#4338CA]"
                : "bg-[#C7D2FE] cursor-not-allowed",
            )}
          >
            Xử lý chuyển kho
          </button>
          <button
            type="button"
            disabled={!canCloseTransfer}
            className={cn(
              "inline-flex h-9 items-center rounded-md px-3 text-[13px] font-semibold text-white",
              canCloseTransfer
                ? "bg-[#22C55E] hover:bg-[#16A34A]"
                : "bg-[#BBF7D0] cursor-not-allowed",
            )}
          >
            Đóng kho tạm
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-4">
          <PosFormItem
            label="Kho xuất"
            layout="horizontal"
            className="w-1/4 pr-3"
            labelClassName="w-1/3"
          >
            <PosSelect<string>
              value={filters.sourceWarehouse}
              onChange={(value) => onFilterChange("sourceWarehouse", value)}
              options={warehouseOptions.map((option) => ({
                value: option,
                label: option,
              }))}
              placeholder=""
            />
          </PosFormItem>
          <PosFormItem
            label="Kho nhập"
            layout="horizontal"
            className="w-1/4 pr-3"
            labelClassName="w-1/3"
          >
            <PosSelect<string>
              value={filters.destinationWarehouse}
              onChange={(value) =>
                onFilterChange("destinationWarehouse", value)
              }
              options={warehouseOptions.map((option) => ({
                value: option,
                label: option,
              }))}
              placeholder=""
            />
          </PosFormItem>
          <div className="w-1/4 pr-3 flex items-center">
            <PosCheckbox
              checked={filters.showRowsNeedingReview}
              onChange={(value) =>
                onFilterChange("showRowsNeedingReview", value)
              }
              label="Hiển thị dòng cần kiểm tra"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <PosFormItem
            label="Người vận chuyển"
            layout="horizontal"
            className="w-1/4 pr-3"
            labelClassName="w-1/3"
          >
            <PosTextInput
              value={filters.transporter}
              onChange={(value) => onFilterChange("transporter", value)}
            />
          </PosFormItem>
          <PosFormItem
            label="Hàng hóa"
            layout="horizontal"
            className="w-1/4 pr-3"
            labelClassName="w-1/3"
          >
            <PosTextInput
              value={filters.product}
              onChange={(value) => onFilterChange("product", value)}
            />
          </PosFormItem>
          <div className="flex items-center gap-3">
            <PosFormItem
              label="Vị trí"
              layout="horizontal"
              className="flex-1 pr-3"
              labelClassName="w-1/3"
            >
              <PosTextInput
                value={filters.location}
                onChange={(value) => onFilterChange("location", value)}
              />
            </PosFormItem>
            <button
              type="button"
              onClick={onAddRow}
              className="inline-flex h-9 items-center rounded-md border border-[#4F46E5] px-6 text-[13px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF]"
            >
              Thêm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
