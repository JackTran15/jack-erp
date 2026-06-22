import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type { ItemCategoryTreeResponse } from "./itemCategoryTree";

export interface ItemCategoryTreeBody {
  search?: string;
  status?: string;
}

/**
 * Loads the Nhóm hàng hoá list as a parent → child tree
 * (`POST /v2/inventory/item-categories/tree`). Unlike the flat search endpoint
 * (capped at 100 rows), this returns the whole tree in one response so the
 * client can render and collapse it without pagination.
 */
export function useItemCategoryTree(body: ItemCategoryTreeBody, enabled: boolean) {
  return useQuery({
    queryKey: ["item-category-tree", body],
    queryFn: async () =>
      requireErpData(
        await erpApi.POST<ItemCategoryTreeResponse>(
          "/v2/inventory/item-categories/tree",
          { body },
        ),
      ),
    enabled,
    placeholderData: (prev) => prev,
  });
}
