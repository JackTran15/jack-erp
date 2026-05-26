import { formatVnd } from "@erp/ui";
import { CountBadge } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSummaryBlock/CountBadge/CountBadge";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";
import { useCheckoutGrandTotal } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-grand-total";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import {
  selectIsReturnExchangeInvoice,
  selectItemCountForPayment,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface PaymentSummaryBlockProps {
  onDepositClick?: () => void;
  onReturnFeeClick?: () => void;
}

export function PaymentSummaryBlock({
  onDepositClick,
  onReturnFeeClick,
}: PaymentSummaryBlockProps) {
  const itemCount = usePosCheckoutSessionStore(selectItemCountForPayment);
  const isReturnExchange = usePosCheckoutSessionStore(
    selectIsReturnExchangeInvoice,
  );
  const total = useCheckoutGrandTotal();
  const { deposit, returnFee } = useCheckoutPayment();

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
      {isReturnExchange ? (
        <PosSummaryRow
          label={
            onReturnFeeClick ? (
              <button
                type="button"
                onClick={onReturnFeeClick}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                Phí đổi trả
              </button>
            ) : (
              "Phí đổi trả"
            )
          }
          value={formatVnd(returnFee)}
        />
      ) : null}
    </div>
  );
}
