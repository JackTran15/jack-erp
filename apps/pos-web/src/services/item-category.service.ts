import { http } from "@erp/pos/lib/common/http";
import type {
  ListItemCategoriesParams,
  SearchItemCategoryTreeParams,
} from "@erp/pos/dtos/item-category.dto";
import type {
  ItemCategoryRow,
  ItemCategoryTreeResponse,
} from "@erp/pos/interfaces/item-category.interface";
import type { Paginated } from "@erp/pos/interfaces/paginated.interface";

export const itemCategoryService = {
  /** Danh mục hàng qua generic CRUD — `GET /admin/entities/inventory-item-categories/records`. */
  list: (
    params: ListItemCategoriesParams = {},
  ): Promise<Paginated<ItemCategoryRow>> => {
    const qs = new URLSearchParams();
    qs.set("page", String(params.page ?? 1));
    qs.set("pageSize", String(params.pageSize ?? 100));
    if (params.search?.trim()) qs.set("search", params.search.trim());
    return http.get<Paginated<ItemCategoryRow>>(
      `/admin/entities/inventory-item-categories/records?${qs.toString()}`,
    );
  },

  /** Cây nhóm hàng hóa (parent → child) — `POST /v2/inventory/item-categories/tree`. */
  tree: (
    params: SearchItemCategoryTreeParams = {},
  ): Promise<ItemCategoryTreeResponse> =>
    http.post<ItemCategoryTreeResponse>(
      "/v2/inventory/item-categories/tree",
      params,
    ),
};
