import { formatVnd } from "@erp/ui";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import {
  selectCustomerDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * "Tính vào công nợ" row — checkbox + label + amount. handleDebtChange yêu
 * cầu selectedCustomer; nếu chưa có sẽ phát cartError qua payment hook.
 */
export function DebtCheckRow() {
  const { debt, handleDebtChange, debtAmount } = useCheckoutPayment();
  const selectedCustomer = usePosCheckoutSessionStore(
    (s) => selectCustomerDraft(s).selectedCustomer,
  );

  return (
    <label className="flex h-10 cursor-pointer items-center justify-between gap-3 text-sm text-gray-900">
      <span className="inline-flex items-center gap-2">
        <PosCheckbox
          checked={debt}
          onChange={(next) => handleDebtChange(next, selectedCustomer)}
          ariaLabel="Tính vào công nợ"
        />
        Tính vào công nợ
      </span>
      <span className="font-semibold text-[#3B5BDB]">{formatVnd(debtAmount)}</span>
    </label>
  );
}
