import { useEffect, useState } from "react";
import { AppModal } from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import {
  getStockSummaryFilterOptions,
  type StockStateFilter,
} from "../../../api/stock-summary";

export interface StockSummaryAdvancedFilters {
  brand: string;
  unit: string;
  isActive: "ALL" | "TRUE" | "FALSE";
  isPosVisible: "ALL" | "TRUE" | "FALSE";
  stockState: StockStateFilter;
}

export const DEFAULT_ADVANCED_FILTERS: StockSummaryAdvancedFilters = {
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
}

export function StockSummaryFilterDialog({ open, initial, onCancel, onApply }: Props) {
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
      </div>
    </AppModal>
  );
}
