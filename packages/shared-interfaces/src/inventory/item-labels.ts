/**
 * Canonical Vietnamese labels for the product/variant naming model, shared by
 * the item form, item list and the product-group search dialog so the four
 * concepts read the same everywhere:
 *
 *   - Mã SKU mẫu mã  → product.code   (e.g. ABA2777)
 *   - Tên mẫu mã     → product.name
 *   - Mã SKU         → item.code      (variant SKU, also the variant barcode)
 *   - Tên hàng hoá   → item.name      (variant display name)
 */
export const ITEM_FIELD_LABELS = {
  modelSku: 'Mã SKU mẫu mã',
  modelName: 'Tên mẫu mã',
  variantSku: 'Mã SKU',
  variantName: 'Tên hàng hoá',
} as const;

export type ItemFieldLabelKey = keyof typeof ITEM_FIELD_LABELS;
