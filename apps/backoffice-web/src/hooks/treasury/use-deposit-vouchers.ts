import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-axios";
import type { DepositVoucherRow } from "../../pages/treasury/deposit/receipts-expenses/receipt-deposit.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export interface DepositVoucherSearchResponse {
  data: DepositVoucherRow[];
  total: number;
  page: number;
  limit: number;
  /** SUM over the whole filtered set, not just this page. */
  totalAmount: number;
}

/**
 * Merged "Thu, chi tiền gửi" list — `POST /v2/deposit-vouchers/search`.
 *
 * Replaces the two independent `/bank-receipts` + `/bank-payments` calls the
 * page used to merge in the browser, where filters and the footer total only
 * ever saw the first 100 rows of each.
 */
export function useDepositVoucherSearch(
  body: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: treasuryQueryKeys.depositVouchers(body),
    queryFn: async () => {
      const { data } = await apiClient.post<DepositVoucherSearchResponse>(
        "/v2/deposit-vouchers/search",
        body,
      );
      return data;
    },
    enabled,
    staleTime: 30_000,
  });
}
