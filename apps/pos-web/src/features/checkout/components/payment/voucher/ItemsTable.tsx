import { cn } from "@erp/ui";
import type { VoucherSelectableItem } from "./types";
import { PosCheckbox } from "../../common/forms/PosCheckbox";
import { ItemsRow } from "./ItemsRow";

interface ItemsTableProps {
  items: VoucherSelectableItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (next: boolean) => void;
}

export function ItemsTable({
  items,
  selectedIds,
  onToggle,
  onToggleAll,
}: ItemsTableProps) {
  const allChecked = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  return (
    <div role="grid" aria-label="Danh sách hàng hóa">
      <div
        role="row"
        className={cn(
          "grid items-center bg-[#F3F4F6] px-3 py-2 text-[14px] font-semibold text-[#1F2937]",
          "grid-cols-[40px_minmax(0,1fr)_48px_96px_96px]",
        )}
      >
        <div role="columnheader" className="flex items-center justify-center">
          <PosCheckbox
            checked={allChecked}
            onChange={onToggleAll}
            ariaLabel="Chọn tất cả hàng hóa"
          />
        </div>
        <div role="columnheader">Tên hàng hóa</div>
        <div role="columnheader" className="text-right">
          SL
        </div>
        <div role="columnheader" className="text-right">
          Đơn giá
        </div>
        <div role="columnheader" className="text-right">
          Thành tiền
        </div>
      </div>

      <div className="divide-y divide-[#E5E7EB]">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] italic text-[#9CA3AF]">
            Chưa có hàng hóa nào trong giỏ
          </p>
        ) : (
          items.map((item) => (
            <ItemsRow
              key={item.id}
              item={item}
              checked={selectedIds.has(item.id)}
              onToggle={() => onToggle(item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
