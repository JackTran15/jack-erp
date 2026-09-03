import { useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { TreeSelectInput } from "../../../../components/forms/TreeSelectInput";
import {
  getStockSummaryFilterOptions,
  type StockStateFilter,
} from "../../../../api/stock-summary";

export interface StockSummaryAdvancedFilters {
  isActive: "ALL" | "TRUE" | "FALSE";
  isPosVisible: "ALL" | "TRUE" | "FALSE";
  stockState: StockStateFilter;
  storageId: string;
  categoryId: string;
  brand: string;
  unit: string;
}

export const DEFAULT_ADVANCED_FILTERS: StockSummaryAdvancedFilters = {
  isActive: "ALL",
  isPosVisible: "ALL",
  stockState: "ALL",
  storageId: "",
  categoryId: "",
  brand: "",
  unit: "",
};

interface Props {
  /** Bộ lọc đang được áp dụng — panel reseed từ đây mỗi lần mở. */
  value: StockSummaryAdvancedFilters;
  /** Số điều kiện đang áp dụng, hiển thị thành badge trên nút. */
  activeCount: number;
  onApply: (next: StockSummaryAdvancedFilters) => void;
  storageOptions: { value: string; label: string }[];
}

/**
 * Bộ lọc bổ sung, bung ra ngay dưới nút trigger. Component tự render nút của
 * mình để Radix neo được panel vào đúng vị trí.
 *
 * `draft` chỉ được commit khi bấm "Đồng ý"; đóng bằng click ra ngoài, `Esc`
 * hay "Huỷ bỏ" đều bỏ thay đổi.
 */
export function StockSummaryFilterPopover({
  value,
  activeCount,
  onApply,
  storageOptions,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StockSummaryAdvancedFilters>(value);

  // Controlled để `enabled: open` bên dưới không phải fetch trước lần mở đầu.
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };

  const optionsQuery = useQuery({
    queryKey: ["stock-summary", "filter-options"],
    queryFn: getStockSummaryFilterOptions,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const brands = optionsQuery.data?.brands ?? [];
  const units = optionsQuery.data?.units ?? [];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button">
          Bộ lọc
          {activeCount > 0 ? (
            <span className="ml-1.5 rounded-full bg-primary-foreground px-1.5 text-[10px] font-semibold leading-4 text-primary">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      {/* Không giới hạn chiều cao / không `overflow`: dropdown của
          TreeSelectInput render `absolute` ngay trong panel nên sẽ bị cắt. */}
      <PopoverContent className="w-[560px]">
        <p className="mb-3 text-sm font-semibold">Bộ lọc bổ sung</p>

        <div className="grid grid-cols-[160px_1fr] items-center gap-x-4 gap-y-3 text-sm">
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
          <TreeSelectInput
            inputId="ssfd-category"
            value={draft.categoryId}
            onChange={(categoryId) => setDraft({ ...draft, categoryId })}
            entityKey="inventory-item-categories"
            placeholder="Tất cả nhóm hàng"
          />

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

        <div className="mt-4 flex justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            <Check className="mr-1 h-4 w-4" />
            Đồng ý
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            <X className="mr-1 h-4 w-4" />
            Huỷ bỏ
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
