import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { treasuryQueryKeys } from "./treasury-query-keys";

export interface PaymentAccountItem {
  id: string;
  paymentMethod: string;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  label: string | null;
  sortOrder: number;
}

export function usePaymentAccounts() {
  return useQuery({
    queryKey: treasuryQueryKeys.paymentAccounts(),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaymentAccountItem[]>("/payment-accounts"),
      ),
    staleTime: 5 * 60_000,
  });
}
