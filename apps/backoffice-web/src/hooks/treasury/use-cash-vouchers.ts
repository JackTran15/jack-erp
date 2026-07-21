import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-axios";
import type { CashVoucherRow } from "../../pages/treasury/cash-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export interface CashVoucherSearchResponse {
  data: CashVoucherRow[];
  total: number;
  page: number;
  limit: number;
  /** SUM over the whole filtered set, not just this page. */
  totalAmount: number;
}

/**
 * Merged "Thu, chi tiền mặt" list — `POST /v2/cash-vouchers/search`.
 *
 * Replaces the two independent `/cash-receipts` + `/cash-payments` calls the
 * page used to merge in the browser, where filters and the footer total only
 * ever saw the first 100 rows of each.
 */
export function useCashVoucherSearch(
  body: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashVouchers(body),
    queryFn: async () => {
      const { data } = await apiClient.post<CashVoucherSearchResponse>(
        "/v2/cash-vouchers/search",
        body,
      );
      return data;
    },
    enabled,
    staleTime: 30_000,
  });
}
