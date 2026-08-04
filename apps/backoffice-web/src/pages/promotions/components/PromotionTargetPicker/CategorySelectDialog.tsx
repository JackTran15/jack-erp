import { useCallback, useState } from "react";
import { AppModal, Button } from "@erp/ui";
import { Trash2 } from "lucide-react";
import { PromotionTargetType } from "@erp/shared-interfaces";
import { TreeSelectInput } from "../../../../components/forms/TreeSelectInput";
import type { PromotionTargetDraft } from "./promotion-target";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Nhóm đã có trong lưới — không cho chọn trùng. */
  selectedIds?: Set<string>;
  onSelect: (drafts: PromotionTargetDraft[]) => void;
}

/**
 * Chọn **nhóm hàng hóa** cho lưới CTKM (`targetType: CATEGORY`).
 *
 * Tách riêng khỏi `ProductSelectDialog` thay vì thêm `mode` vào nó (phương án (a)
 * của TKT-KM-15): thân dialog đó gần như toàn bộ là bảng hàng hóa/mẫu mã —
 * mở rộng dòng cha, cache mẫu mã, cột SL/đơn giá, nhập nhanh. Chọn nhóm không
 * dùng thứ nào trong số đó, nên thêm `mode` sẽ phải rẽ nhánh gần hết phần render
 * của một file 34K đang có **9 nơi gọi** — đúng điều kiện "(a) làm component
 * phình quá mức" mà ticket đặt ra để chuyển sang (b).
 *
 * Vẫn **dùng chung nguồn dữ liệu cây**: `TreeSelectInput` với
 * `entityKey="inventory-item-categories"`, đúng cái bộ lọc nhóm của
 * `ProductSelectDialog` đang dùng. Không thêm API mới.
 */
export function CategorySelectDialog({
  open,
  onOpenChange,
  title,
  selectedIds,
  onSelect,
}: Props) {
  const [picked, setPicked] = useState<PromotionTargetDraft[]>([]);
  /** Reset `TreeSelectInput` sau mỗi lần chọn để chọn tiếp nhóm khác. */
  const [treeNonce, setTreeNonce] = useState(0);

  const addCategory = useCallback(
    (item: { id: string; code: string; name: string }) => {
      setPicked((prev) => {
        if (selectedIds?.has(item.id) || prev.some((p) => p.targetId === item.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            targetType: PromotionTargetType.CATEGORY,
            targetId: item.id,
            code: item.code,
            name: item.name,
            unit: "",
            sellingPrice: 0,
          },
        ];
      });
      setTreeNonce((n) => n + 1);
    },
    [selectedIds],
  );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      preventOutsideClose
      title={title}
      description={null}
      defaultWidth={560}
      defaultHeight={480}
      minWidth={420}
      minHeight={360}
      bodyClassName="flex flex-col gap-3"
      showFooter
      footer={
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Đã chọn{" "}
            <span className="font-semibold text-foreground">{picked.length}</span>{" "}
            nhóm hàng hóa.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button
              disabled={picked.length === 0}
              onClick={() => {
                onSelect(picked);
                onOpenChange(false);
              }}
            >
              Chọn
            </Button>
          </div>
        </div>
      }
    >
      <div>
        <p className="mb-1.5 text-sm font-medium">Nhóm hàng hóa</p>
        <TreeSelectInput
          key={treeNonce}
          inputId="promotion-category-select"
          placeholder="Tìm và chọn nhóm hàng hóa"
          value=""
          onChange={() => {}}
          onSelectItem={addCategory}
          entityKey="inventory-item-categories"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Chọn được nhóm ở bất kỳ cấp nào. Khuyến mại đặt ở nhóm cha áp dụng cho cả
          hàng hóa thuộc nhóm con.
        </p>
      </div>

      {picked.length > 0 ? (
        <ul className="min-h-0 flex-1 divide-y overflow-auto rounded-md border">
          {picked.map((cat) => (
            <li
              key={cat.targetId}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">{cat.code}</span> — {cat.name}
              </span>
              <button
                type="button"
                aria-label={`Bỏ chọn ${cat.name}`}
                className="shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-muted"
                onClick={() =>
                  setPicked((prev) =>
                    prev.filter((p) => p.targetId !== cat.targetId),
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </AppModal>
  );
}
