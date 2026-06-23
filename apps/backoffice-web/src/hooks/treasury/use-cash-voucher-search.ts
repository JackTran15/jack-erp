import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type {
  PaginatedSearchResponse,
  ReceiptPaymentListItem,
  StringSearchFilter,
} from "../../pages/treasury/cash-vouchers.types";

export type CashVoucherDocumentType =
  | "cash_receipt"
  | "cash_payment"
  | "goods_receipt_payment";

export interface CashVoucherSearchBody {
  page: number;
  limit: number;
  cashAccountId?: string;
  voucherDate?: { from?: string; to?: string };
  documentNumber?: StringSearchFilter;
  documentType?: { value: CashVoucherDocumentType };
  totalAmount?: {
    operator: "=" | "<" | "<=" | ">" | ">=";
    value: string;
  };
  counterparty?: StringSearchFilter;
  reason?: StringSearchFilter;
}

export function useCashVoucherSearch(
  body: CashVoucherSearchBody,
  enabled = true,
) {
  return useQuery({
    queryKey: ["cash-vouchers", "search", body],
    queryFn: async () =>
      requireErpData(
        await erpApi.POST<PaginatedSearchResponse<ReceiptPaymentListItem>>(
          "/v2/cash-vouchers/search",
          { body },
        ),
      ),
    enabled,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}
