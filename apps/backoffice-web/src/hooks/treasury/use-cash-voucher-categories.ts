import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { flattenCategoryTree } from "../../components/crud/itemCategoryTree";
import {
  CashVoucherCategoryDirection,
  type CashVoucherCategory,
} from "../../pages/treasury/cash-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

interface CategoryTreeNode extends Omit<CashVoucherCategory, "depth"> {
  children: CategoryTreeNode[];
}

/**
 * Mục thu / Mục chi for the voucher dialogs, in tree order (each parent
 * followed by its children, `depth` set for indentation). Reads the whole
 * tree in one call, so there is no page cap. Inactive categories are kept on
 * purpose: `useCategoryNameMap` must still resolve the name on old vouchers.
 */
export function useCashVoucherCategories(
  direction?: CashVoucherCategoryDirection,
) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashVoucherCategories(direction),
    queryFn: async () => {
      const res = await requireErpData(
        await erpApi.POST<{ data: CategoryTreeNode[] }>(
          "/v2/cash-voucher-categories/tree",
          { body: direction ? { direction } : {} },
        ),
      );
      return flattenCategoryTree(res.data ?? []).map<CashVoucherCategory>(
        ({ __depth, __hasChildren, __collapsed, ...node }) => ({
          ...node,
          depth: __depth,
        }),
      );
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Label for a native `<option>`: children are indented under their parent
 * with non-breaking spaces — `<option>` collapses ordinary leading
 * whitespace, so plain spaces would render flat.
 */
export function formatCategoryOptionLabel(category: CashVoucherCategory): string {
  return " ".repeat((category.depth ?? 0) * 3) + category.name;
}

export function useCategoryNameMap(
  direction?: CashVoucherCategoryDirection,
): Map<string, string> {
  const { data } = useCashVoucherCategories(direction);
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data ?? []) {
      map.set(c.id, c.name);
    }
    return map;
  }, [data]);
}
