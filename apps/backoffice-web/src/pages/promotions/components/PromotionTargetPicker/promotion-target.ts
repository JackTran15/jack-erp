import { PromotionDiscountMode, PromotionTargetType } from "@erp/shared-interfaces";
import type { ProductSelectResult } from "../../../../components/shared/product-select/ProductSelectDialog";

/**
 * Một dòng đã chọn, chuẩn hóa về đúng những gì mọi lưới của form CTKM cần.
 * Từng lưới tự map tiếp sang kiểu dòng riêng của nó (`GoodsDiscountRow`,
 * `TierProduct`, `GiftProduct`, `BuyGetRow`, `ApplicableGood`).
 */
export interface PromotionTargetDraft {
  targetType: PromotionTargetType;
  targetId: string;
  code: string;
  name: string;
  unit: string;
  sellingPrice: number;
}

/** Cấp chọn mà một lưới cho phép. */
export type TargetPickMode = "PRODUCT_OR_ITEM" | "ITEM" | "CATEGORY";

/**
 * `TierTarget` của view-model form → cấp chọn của picker.
 *
 * `VARIANT` (từ vựng "mẫu mã" của REQ) và `PromotionTargetType.ITEM` là **cùng
 * một khái niệm**, chỉ khác tên — xem `docs/26-promotion-design.md` §10.3.
 */
export function pickModeForTierTarget(
  target: "PRODUCT" | "VARIANT" | "GROUP",
): TargetPickMode {
  switch (target) {
    case "PRODUCT":
      return "PRODUCT_OR_ITEM";
    case "VARIANT":
      return "ITEM";
    case "GROUP":
      return "CATEGORY";
  }
}

/**
 * `ProductSelectResult → PromotionTargetDraft[]`.
 *
 * Dialog phân biệt sẵn hai cấp: `fullySelectedProductIds` là "chọn cả hàng hóa"
 * (mọi mẫu mã của nó), `standaloneItemIds` là "chọn lẻ mẫu mã". Đó đúng là ranh
 * giới `PRODUCT` ↔ `ITEM` mà `promotion_lines.target_type` cần — không phải suy
 * đoán gì thêm.
 *
 * Ở chế độ `ITEM`, lưới không lưu được tham chiếu cấp hàng hóa, nên một product
 * được chọn trọn sẽ **bung ra thành từng mẫu mã** thay vì bị bỏ qua im lặng.
 */
export function toPromotionTargets(
  result: ProductSelectResult,
  mode: TargetPickMode,
): PromotionTargetDraft[] {
  if (mode === "CATEGORY") return [];

  const byItemId = new Map(result.lines.map((line) => [line.itemId, line]));

  const itemDraft = (itemId: string): PromotionTargetDraft | undefined => {
    const line = byItemId.get(itemId);
    if (!line) return undefined;
    return {
      targetType: PromotionTargetType.ITEM,
      targetId: line.itemId,
      code: line.sku,
      name: line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name,
      unit: line.unit,
      sellingPrice: line.sellingPrice ?? 0,
    };
  };

  if (mode === "ITEM") {
    // Mọi mẫu mã đã resolve, kể cả mẫu mã của product được chọn trọn.
    return result.lines
      .map((line) => itemDraft(line.itemId))
      .filter((draft): draft is PromotionTargetDraft => draft !== undefined);
  }

  const products: PromotionTargetDraft[] = result.fullySelectedProducts.map(
    (row) => ({
      targetType: PromotionTargetType.PRODUCT,
      targetId: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
      sellingPrice: row.sellingPrice ?? 0,
    }),
  );

  const standalone = result.standaloneItemIds
    .map(itemDraft)
    .filter((draft): draft is PromotionTargetDraft => draft !== undefined);

  return [...products, ...standalone];
}

/**
 * Gộp kết quả chọn vào một lưới đang có.
 *
 * Hai quy tắc mà cả 6 lưới đều cần, nên đặt chung ở đây thay vì chép 6 lần:
 * - **không ghi đè** dòng đã có (AC-28: đóng dialog là *thêm* vào lưới);
 * - **không thêm trùng** dòng đã trỏ tới cùng target;
 * - dọn các dòng trống mà người dùng chưa nhập gì, để lưới không lởm chởm ô rỗng
 *   xen giữa dòng thật.
 */
export function mergeTargetsIntoGrid<Row>(
  rows: Row[],
  drafts: PromotionTargetDraft[],
  options: {
    targetIdOf: (row: Row) => string;
    isBlank: (row: Row) => boolean;
    toRow: (draft: PromotionTargetDraft) => Row;
  },
): Row[] {
  const kept = rows.filter((row) => !options.isBlank(row));
  const taken = new Set(kept.map(options.targetIdOf).filter(Boolean));

  const added = drafts
    .filter((draft) => !taken.has(draft.targetId))
    .map(options.toRow);

  return [...kept, ...added];
}

/**
 * Giá sau khuyến mại hiển thị trên lưới.
 *
 * Phải làm tròn **về đồng** giống `roundVnd` của domain (A-10) — FE và BE lệch
 * quy tắc làm tròn thì con số trên form khác con số BE tính, loại bug rất khó truy.
 */
export function promoPrice(
  sellingPrice: number,
  mode: PromotionDiscountMode,
  value: number,
): number {
  switch (mode) {
    case PromotionDiscountMode.PERCENT:
      return Math.round(sellingPrice * (1 - value / 100));
    case PromotionDiscountMode.AMOUNT:
      return Math.max(0, Math.round(sellingPrice - value));
    case PromotionDiscountMode.FIXED_PRICE:
      return Math.round(value);
  }
}
