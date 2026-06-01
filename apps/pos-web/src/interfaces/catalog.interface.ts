import type { PosProductKind } from "@erp/pos/types/catalog.type";

export interface PosCatalogLine {
  itemId: string;
  /** Product cha (gom biến thể) — null với hàng lẻ không thuộc product nào. */
  productId: string | null;
  code: string;
  name: string;
  unit: string;
  sellingPrice: number;
  quantityOnHand: number;
  locations: { locationId: string; name: string; quantity: number }[];
  defaultLocationId: string;
}

/**
 * Một card catalog ở mức PRODUCT — `GET /pos/branches/:id/catalog/products`.
 * `kind=PRODUCT` gom các biến thể dưới 1 product; `kind=ITEM` là hàng lẻ standalone.
 * `id` là product id (PRODUCT) hoặc item id (ITEM). Mirror `PosProductCardDto` (BE).
 */
export interface PosProductCard {
  kind: PosProductKind;
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  minPrice: number;
  maxPrice: number;
  unit: string;
  variantCount: number;
  quantityOnHand: number;
}

/** Trang danh sách catalog mức product (mirror `PosProductListResponseDto`). */
export interface PosProductListResponse {
  data: PosProductCard[];
  total: number;
  page: number;
  pageSize: number;
}

/** Một vị trí lưu giữ tồn của biến thể tại chi nhánh. */
export interface PosVariantLocation {
  locationId: string;
  name: string;
  quantity: number;
}

/** Giá trị 1 thuộc tính đã resolve của biến thể (vd { name: "Size", value: "39" }). */
export interface PosVariantAttribute {
  name: string;
  value: string;
}

/** Một biến thể (SKU) bán được, kèm tồn tại chi nhánh. */
export interface PosProductVariant {
  itemId: string;
  code: string;
  name: string;
  variantLabel: string | null;
  unit: string;
  sellingPrice: number;
  imageUrl: string | null;
  attributes: PosVariantAttribute[];
  quantityOnHand: number;
  locations: PosVariantLocation[];
}

/** Một chiều thuộc tính của product và các option khả dụng. */
export interface PosProductAttribute {
  name: string;
  options: string[];
}

/** Chi tiết product kèm biến thể + tồn tại chi nhánh. */
export interface PosProductDetail {
  kind: PosProductKind;
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  isActive: boolean;
  minPrice: number;
  maxPrice: number;
  attributes: PosProductAttribute[];
  variants: PosProductVariant[];
}
