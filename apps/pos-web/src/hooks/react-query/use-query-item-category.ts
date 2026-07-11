import { useQuery } from "@tanstack/react-query";

import { ITEM_CATEGORY_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { itemCategoryService } from "@erp/pos/services/item-category.service";

const STALE_TIME_MS = 5 * 60_000;
const PAGE_SIZE = 100;

/**
 * Danh mục hàng (entityKey `inventory-item-categories`) — đổ vào combobox "Lọc
 * theo nhóm hàng hóa". Scope theo organization ở BE, không cần branch.
 */
export const useItemCategoriesQuery = () => {
  return useQuery({
    queryKey: ITEM_CATEGORY_KEYS.LIST({ page: 1, pageSize: PAGE_SIZE }),
    queryFn: () => itemCategoryService.list({ page: 1, pageSize: PAGE_SIZE }),
    staleTime: STALE_TIME_MS,
  });
};

/**
 * Cây nhóm hàng hóa (parent → child) cho tree-select "Lọc theo nhóm hàng hóa".
 * Scope theo organization ở BE.
 */
export const useItemCategoryTreeQuery = () => {
  return useQuery({
    queryKey: ITEM_CATEGORY_KEYS.TREE({}),
    queryFn: () => itemCategoryService.tree(),
    staleTime: STALE_TIME_MS,
  });
};
