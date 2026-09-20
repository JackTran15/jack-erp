import { useEffect, useState } from "react";
import { AppModal, Button } from "@erp/ui";
import { HelpCircle, Save, X } from "lucide-react";
import {
  ColumnConfigTable,
  type ColumnConfigRow,
} from "../../../../components/table/column-config/ColumnConfigTable/ColumnConfigTable";
import { ReorderButtonGroup } from "../../../../components/table/column-config/ReorderButtonGroup/ReorderButtonGroup";
import type { OrdersColumnPrefs } from "../../../../store/page-stores/orders/orders.interface";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../../store/page-stores/orders/orders.store";
import {
  ORDER_COLUMNS,
  ORDER_COLUMN_BY_KEY,
  ORDER_COLUMN_ORDER,
  ORDER_FROZEN_KEYS,
  type OrderColumnKey,
} from "../../_lib/order-columns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function defaultPrefs(): OrdersColumnPrefs {
  return {
    order: [...ORDER_COLUMN_ORDER],
    visibility: Object.fromEntries(ORDER_COLUMNS.map((c) => [c.key, true])),
    frozen: [...ORDER_FROZEN_KEYS],
  };
}

/**
 * Cấu hình cột của lưới đơn hàng.
 *
 * Dùng chung `ColumnConfigTable` / `ReorderButtonGroup` với modal "Sửa mẫu" của
 * trang Báo cáo để hai chỗ không lệch nhau. Phần logic thì riêng: lưới đơn hàng
 * không có nhóm cột, và thiết lập lưu ở store của trang chứ không qua API
 * template như báo cáo.
 *
 * Bất biến: cột ghim luôn liền khối ở đầu `order` — điều kiện để
 * `computeFrozenOffsets` của BaseDataTable tính đúng offset trái.
 */
export function OrdersColumnSettingsDialog({ open, onOpenChange }: Props) {
  const columns = useOrdersStore((s) => s.columns);
  const { setColumns } = useOrdersActions();
  const [draft, setDraft] = useState<OrdersColumnPrefs>(columns);
  const [selectedKey, setSelectedKey] = useState<OrderColumnKey | null>(null);

  // Seed lại draft từ store mỗi lần mở dialog.
  useEffect(() => {
    if (open) {
      setDraft(columns);
      setSelectedKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isVisible = (key: OrderColumnKey) => draft.visibility[key] !== false;
  const isFrozen = (key: OrderColumnKey) => draft.frozen.includes(key);
  const visibleCount = draft.order.filter(isVisible).length;

  const rows: ColumnConfigRow[] = draft.order.map((key) => {
    const label = ORDER_COLUMN_BY_KEY.get(key)?.header ?? key;
    return {
      kind: "column",
      id: key,
      indented: false,
      dataLabel: label,
      displayLabel: label,
      visible: isVisible(key),
      pinned: isFrozen(key),
      selected: selectedKey === key,
    };
  });

  const allVisible = draft.order.every(isVisible);
  const noneVisible = draft.order.every((key) => !isVisible(key));
  const allFrozen = draft.order.every(isFrozen);
  const noneFrozen = draft.frozen.length === 0;

  const toggleVisibility = (key: OrderColumnKey) =>
    setDraft((prev) => ({
      ...prev,
      visibility: { ...prev.visibility, [key]: prev.visibility[key] === false },
    }));

  /** Ghim → đẩy lên cuối khối ghim; bỏ ghim → thả ngay sau khối ghim. */
  const toggleFrozen = (key: OrderColumnKey) =>
    setDraft((prev) => {
      const wasFrozen = prev.frozen.includes(key);
      const frozen = wasFrozen
        ? prev.frozen.filter((item) => item !== key)
        : [...prev.frozen, key];
      const rest = prev.order.filter((item) => item !== key);
      const insertAt = wasFrozen ? frozen.length : frozen.length - 1;
      return {
        ...prev,
        frozen,
        order: [...rest.slice(0, insertAt), key, ...rest.slice(insertAt)],
      };
    });

  /** Đổi chỗ với hàng kề, nhưng không cho cột vượt ra khỏi khối của nó. */
  const swap = (key: OrderColumnKey, dir: "up" | "down"): OrdersColumnPrefs | null => {
    const index = draft.order.indexOf(key);
    const target = index + (dir === "up" ? -1 : 1);
    if (index < 0 || target < 0 || target >= draft.order.length) return null;
    const neighbour = draft.order[target]!;
    if (isFrozen(key) !== isFrozen(neighbour)) return null;
    const order = [...draft.order];
    [order[index], order[target]] = [order[target]!, order[index]!];
    return { ...draft, order };
  };

  const canUp = Boolean(selectedKey && swap(selectedKey, "up"));
  const canDown = Boolean(selectedKey && swap(selectedKey, "down"));

  const move = (dir: "up" | "down") => {
    if (!selectedKey) return;
    const next = swap(selectedKey, dir);
    if (next) setDraft(next);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Sửa mẫu"
      defaultWidth={1040}
      defaultHeight={640}
      footer={
        <div className="flex items-center sm:justify-between">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
          >
            <HelpCircle className="h-4 w-4" />
            Trợ giúp
          </button>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(defaultPrefs());
                setSelectedKey(null);
              }}
            >
              Lấy mẫu ngầm định
            </Button>
            <Button
              type="button"
              size="sm"
              className="!bg-primary-blue !text-primary-blue-foreground hover:!bg-primary-blue-hover"
              disabled={visibleCount === 0}
              onClick={() => {
                setColumns(draft);
                onOpenChange(false);
              }}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Lưu
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="mr-1.5 h-4 w-4" />
              Hủy bỏ
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-3 text-sm font-semibold uppercase">Danh sách đơn hàng</div>
      <div className="flex items-center gap-4">
        <div className="max-h-[60vh] min-h-0 flex-1 overflow-auto border border-border">
          <ColumnConfigTable
            rows={rows}
            headerVisibility={
              allVisible ? "checked" : noneVisible ? "unchecked" : "indeterminate"
            }
            headerPinned={allFrozen ? "checked" : noneFrozen ? "unchecked" : "indeterminate"}
            onToggleHeaderVisibility={() =>
              setDraft((prev) => ({
                ...prev,
                visibility: Object.fromEntries(
                  prev.order.map((key) => [key, !allVisible]),
                ),
              }))
            }
            onToggleHeaderPinned={() =>
              // Ghim tất cả thì thứ tự giữ nguyên (cả mảng đã là khối ghim);
              // bỏ ghim tất cả cũng vậy.
              setDraft((prev) => ({
                ...prev,
                frozen: allFrozen ? [] : [...prev.order],
              }))
            }
            onSelectRow={(row) =>
              setSelectedKey(row.kind === "column" ? (row.id as OrderColumnKey) : null)
            }
            onToggleExpand={() => undefined}
            onToggleVisibility={(row) =>
              row.kind === "column" && toggleVisibility(row.id as OrderColumnKey)
            }
            onTogglePinned={(row) =>
              row.kind === "column" && toggleFrozen(row.id as OrderColumnKey)
            }
          />
        </div>
        <div>
          <ReorderButtonGroup
            canUp={canUp}
            canDown={canDown}
            onUp={() => move("up")}
            onDown={() => move("down")}
          />
        </div>
      </div>
    </AppModal>
  );
}
