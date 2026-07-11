/** Params cho `itemCategoryService.list` (CRUD records của inventory-item-categories). */
export interface ListItemCategoriesParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

/** Body cho `itemCategoryService.tree` (`POST /v2/inventory/item-categories/tree`). */
export interface SearchItemCategoryTreeParams {
  search?: string;
  status?: string;
}
