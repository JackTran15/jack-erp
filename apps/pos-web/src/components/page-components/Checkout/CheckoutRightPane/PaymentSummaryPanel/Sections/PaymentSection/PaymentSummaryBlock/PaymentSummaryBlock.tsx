import { formatVnd } from "@erp/ui";
import { CountBadge } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSummaryBlock/CountBadge/CountBadge";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";
import { useCheckoutGrandTotal } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-grand-total";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import {
  selectItemCountForPayment,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface PaymentSummaryBlockProps {
  /** Click "Đặt cọc" — host mở deposit dialog. */
  onDepositClick?: () => void;
}

/**
 * "Tổng tiền / Đặt cọc" block. Item count appears as a small CountBadge
 * inline with the "Tổng tiền" label. Đọc từ session store + payment hook.
 */
export function PaymentSummaryBlock({ onDepositClick }: PaymentSummaryBlockProps) {
  const itemCount = usePosCheckoutSessionStore(selectItemCountForPayment);
  const total = useCheckoutGrandTotal();
  const { deposit } = useCheckoutPayment();

  return (
    <div className="space-y-2 py-3">
      <PosSummaryRow
        label={
          <span className="inline-flex items-center gap-1.5">
            Tổng tiền <CountBadge>{itemCount}</CountBadge>
          </span>
        }
        value={formatVnd(total)}
        emphasis="strong"
      />
      <PosSummaryRow
        label={
          onDepositClick ? (
            <button
              type="button"
              onClick={onDepositClick}
              className="text-sm  text-indigo-600 hover:text-indigo-700"
            >
              Đặt cọc
            </button>
          ) : (
            "Đặt cọc"
          )
        }
        value={formatVnd(deposit)}
      />
    </div>
  );
}
