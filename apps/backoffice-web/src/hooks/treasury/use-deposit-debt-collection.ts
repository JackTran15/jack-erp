import { useMutation, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type {
  CreateDepositDebtCollectionBody,
  DepositDebtCollectionResult,
} from "../../pages/treasury/bank-vouchers.types";

/**
 * "Thu nợ" into a deposit fund. Settles the picked invoice debts and issues the
 * Phiếu thu tiền gửi in one server-side transaction — unlike a plain voucher,
 * which would take the money without reducing the customer's debt.
 */
export function useDepositDebtCollectionMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateDepositDebtCollectionBody) =>
      requireErpData(
        await erpApi.POST<DepositDebtCollectionResult>(
          "/bank-receipts/debt-collection",
          { body },
        ),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bank-receipts"] });
      void qc.invalidateQueries({ queryKey: ["deposit-vouchers"] });
      void qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
      void qc.invalidateQueries({ queryKey: ["deposit-accounts"] });
      // The customer's outstanding balance just changed.
      void qc.invalidateQueries({ queryKey: ["customer-debts"] });
      void qc.invalidateQueries({ queryKey: ["voucher-partners", "customer-debts"] });
    },
  });
}
