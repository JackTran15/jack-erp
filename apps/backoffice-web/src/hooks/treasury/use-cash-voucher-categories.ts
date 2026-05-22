import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PaginatedResponse } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import {
  CashVoucherCategoryDirection,
  type CashVoucherCategory,
} from "../../pages/treasury/cash-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

const ENTITY_KEY = "cash-voucher-categories";

export function useCashVoucherCategories(
  direction?: CashVoucherCategoryDirection,
) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashVoucherCategories(direction),
    queryFn: async () => {
      const filters: Record<string, unknown> = {};
      if (direction) filters.direction = direction;
      const res = await requireErpData(
        await erpApi.GET<PaginatedResponse<CashVoucherCategory>>(
          "/admin/entities/{entityKey}/records",
          {
            params: {
              path: { entityKey: ENTITY_KEY },
              query: {
                page: 1,
                pageSize: 100,
                ...(Object.keys(filters).length
                  ? { filters: JSON.stringify(filters) }
                  : {}),
              },
            },
          },
        ),
      );
      return res.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
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
