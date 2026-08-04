import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../../../components/shared/product-select/ProductSelectDialog";
import { CategorySelectDialog } from "./CategorySelectDialog";
import {
  toPromotionTargets,
  type PromotionTargetDraft,
  type TargetPickMode,
} from "./promotion-target";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cấp chọn mà lưới gọi cho phép — quyết định `targetType` của dòng thu được. */
  mode: TargetPickMode;
  title?: string;
  /** Id đã có trong lưới, để dialog hiện trạng thái đã chọn và không cho chọn trùng. */
  selectedIds?: Set<string>;
  onSelect: (drafts: PromotionTargetDraft[]) => void;
}

/**
 * Chỗ **duy nhất** map kết quả dialog chọn hàng sang dòng lưới của form CTKM.
 *
 * Sáu lưới của 5 hình thức đều đi qua đây, nên không lưới nào tự dựng dialog
 * (quy ước đã chốt: tích hợp vào component có sẵn, không scaffold bản song song)
 * và không lưới nào lặp lại đoạn map `ProductSelectResult`.
 */
export function PromotionTargetPicker({
  open,
  onOpenChange,
  mode,
  title,
  selectedIds,
  onSelect,
}: Props) {
  if (!open) return null;

  if (mode === "CATEGORY") {
    return (
      <CategorySelectDialog
        open
        onOpenChange={onOpenChange}
        title={title ?? "Chọn nhóm hàng hóa"}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />
    );
  }

  const handleConfirm = (result: ProductSelectResult) => {
    onSelect(toPromotionTargets(result, mode));
  };

  return (
    <ProductSelectDialog
      open
      onOpenChange={onOpenChange}
      title={title ?? "Chọn hàng hóa"}
      initialSelectedIds={selectedIds}
      onConfirm={handleConfirm}
    />
  );
}
