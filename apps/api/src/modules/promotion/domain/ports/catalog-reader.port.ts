export const CATALOG_READER = Symbol('CATALOG_READER');

export interface CatalogItemView {
  itemId: string;
  /** ItemEntity.code IS the SKU — the repo has no separate `sku` column. */
  code: string;
  name: string;
  unit: string;
  sellingPrice: number;
  productId?: string;
  categoryId?: string;
  /** categoryId plus every ancestor, so a promotion targeting a parent group matches its children. */
  categoryPathIds: string[];
}

export interface CatalogReaderPort {
  loadItems(orgId: string, itemIds: string[]): Promise<Map<string, CatalogItemView>>;
}
