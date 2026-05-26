import { useQuery } from "@tanstack/react-query";
import {
  filterReceiptPaymentByPeriod,
  mergeReceiptPaymentLists,
} from "../../pages/treasury/cash-vouchers.adapters";
import type { CashPaymentListQuery, CashReceiptListQuery } from "../../pages/treasury/cash-vouchers.types";
import { useCashPaymentsList } from "./use-cash-payments";
import { useCashReceiptsList } from "./use-cash-receipts";

export function useMergedReceiptPayments(
  receiptQuery: CashReceiptListQuery,
  paymentQuery: CashPaymentListQuery,
  period?: { from?: string; to?: string },
  enabled = true,
) {
  const receipts = useCashReceiptsList(receiptQuery, enabled);
  const payments = useCashPaymentsList(paymentQuery, enabled);

  const merged = useQuery({
    queryKey: [
      "cash-receipts-payments-merged",
      receiptQuery,
      paymentQuery,
      period,
      receipts.dataUpdatedAt,
      payments.dataUpdatedAt,
    ],
    queryFn: () => {
      const r = receipts.data?.data ?? [];
      const p = payments.data?.data ?? [];
      let rows = mergeReceiptPaymentLists(r, p);
      if (period?.from && period?.to) {
        rows = filterReceiptPaymentByPeriod(rows, period.from, period.to);
      }
      return rows;
    },
    enabled: enabled && receipts.isSuccess && payments.isSuccess,
  });

  return {
    receipts,
    payments,
    merged,
    isLoading: receipts.isLoading || payments.isLoading,
    isError: receipts.isError || payments.isError,
    refetch: () => {
      void receipts.refetch();
      void payments.refetch();
    },
  };
}
