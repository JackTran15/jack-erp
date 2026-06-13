import { useEffect, useState } from "react";
import { AppModal } from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import {
  getStockSummaryFilterOptions,
  type StockStateFilter,
} from "../../../api/stock-summary";

export interface StockSummaryAdvancedFilters {
  storageId: string;
  categoryId: string;
  movementFrom: string;
  movementTo: string;
  excludeReservations: boolean;
  brand: string;
  unit: string;
  isActive: "ALL" | "TRUE" | "FALSE";
  isPosVisible: "ALL" | "TRUE" | "FALSE";
  stockState: StockStateFilter;
}

export const DEFAULT_ADVANCED_FILTERS: StockSummaryAdvancedFilters = {
  storageId: "",
  categoryId: "",
  movementFrom: "",
  movementTo: "",
  excludeReservations: false,
  brand: "",
  unit: "",
  isActive: "ALL",
  isPosVisible: "ALL",
  stockState: "ALL",
};

interface Props {
  open: boolean;
  initial: StockSummaryAdvancedFilters;
  onCancel: () => void;
  onApply: (next: StockSummaryAdvancedFilters) => void;
  storageOptions: { value: string; label: string }[];
  categoryOptions: { value: string; label: string }[];
}

export function StockSummaryFilterDialog({
  open,
  initial,
  onCancel,
  onApply,
  storageOptions,
  categoryOptions,
}: Props) {
  const [draft, setDraft] = useState<StockSummaryAdvancedFilters>(initial);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const optionsQuery = useQuery({
    queryKey: ["stock-summary", "filter-options"],
    queryFn: getStockSummaryFilterOptions,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const brands = optionsQuery.data?.brands ?? [];
  const units = optionsQuery.data?.units ?? [];

  const handleSave = () => {
    onApply(draft);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      title="Bộ lọc bổ sung"
      saveLabel="Đồng ý"
      cancelLabel="Huỷ bỏ"
      onSave={handleSave}
      onCancel={onCancel}
      defaultWidth={560}
    >
      <div className="grid grid-cols-[160px_1fr] items-center gap-x-4 gap-y-3 pb-4 text-sm">
        <label htmlFor="ssfd-storage" className="text-foreground">
          Kho
        </label>
        <select
          id="ssfd-storage"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.storageId}
          onChange={(e) => setDraft({ ...draft, storageId: e.target.value })}
        >
          <option value="">Tất cả kho</option>
          {storageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label htmlFor="ssfd-category" className="text-foreground">
          Nhóm hàng hóa
        </label>
        <select
          id="ssfd-category"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.categoryId}
          onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
        >
          <option value="">Tất cả nhóm hàng</option>
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label htmlFor="ssfd-movementFrom" className="text-foreground">
          Phát sinh tồn từ ngày
        </label>
        <input
          id="ssfd-movementFrom"
          type="date"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.movementFrom}
          onChange={(e) => setDraft({ ...draft, movementFrom: e.target.value })}
        />

        <label htmlFor="ssfd-movementTo" className="text-foreground">
          Phát sinh tồn đến ngày
        </label>
        <input
          id="ssfd-movementTo"
          type="date"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.movementTo}
          onChange={(e) => setDraft({ ...draft, movementTo: e.target.value })}
        />

        <label htmlFor="ssfd-isActive" className="text-foreground">
          Trạng thái kinh doanh
        </label>
        <select
          id="ssfd-isActive"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.isActive}
          onChange={(e) =>
            setDraft({ ...draft, isActive: e.target.value as StockSummaryAdvancedFilters["isActive"] })
          }
        >
          <option value="ALL">Tất cả</option>
          <option value="TRUE">Đang kinh doanh</option>
          <option value="FALSE">Ngừng kinh doanh</option>
        </select>

        <label htmlFor="ssfd-isPos" className="text-foreground">
          Trạng thái giao dịch
        </label>
        <select
          id="ssfd-isPos"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.isPosVisible}
          onChange={(e) =>
            setDraft({
              ...draft,
              isPosVisible: e.target.value as StockSummaryAdvancedFilters["isPosVisible"],
            })
          }
        >
          <option value="ALL">Tất cả</option>
          <option value="TRUE">Đang giao dịch</option>
          <option value="FALSE">Ngừng giao dịch</option>
        </select>

        <label htmlFor="ssfd-stockState" className="text-foreground">
          Trạng thái tồn
        </label>
        <select
          id="ssfd-stockState"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.stockState}
          onChange={(e) =>
            setDraft({ ...draft, stockState: e.target.value as StockStateFilter })
          }
        >
          <option value="ALL">Tất cả</option>
          <option value="IN_STOCK">Còn tồn</option>
          <option value="OUT_OF_STOCK">Hết tồn</option>
          <option value="NEGATIVE">Tồn âm</option>
        </select>

        <label htmlFor="ssfd-brand" className="text-foreground">
          Thương hiệu
        </label>
        <select
          id="ssfd-brand"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.brand}
          onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
        >
          <option value="">Tất cả</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <label htmlFor="ssfd-unit" className="text-foreground">
          Đơn vị tính
        </label>
        <select
          id="ssfd-unit"
          className="h-9 rounded border border-input bg-background px-2"
          value={draft.unit}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
        >
          <option value="">Tất cả ĐVT</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <span className="text-foreground">Hàng khách đặt</span>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.excludeReservations}
            onChange={(e) =>
              setDraft({ ...draft, excludeReservations: e.target.checked })
            }
          />
          Trừ số lượng hàng hóa khách đặt vào tồn kho
        </label>
      </div>
    </AppModal>
  );
}
