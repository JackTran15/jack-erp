import { formatVnd } from "@erp/ui";
import { CountBadge } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSummaryBlock/CountBadge/CountBadge";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { useCheckoutGrandTotal } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-grand-total";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { useCheckoutPromotion } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-promotion";
import {
  selectEffectivePointsRedeemed,
  selectIsReturnExchangeInvoice,
  selectItemCountForPayment,
  selectPointsDiscountAmount,
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
  const pointsRedeemed = usePosCheckoutSessionStore(
    selectEffectivePointsRedeemed,
  );
  const pointsDiscountAmount = usePosCheckoutSessionStore(
    selectPointsDiscountAmount,
  );
  const { clearRedeemedPoints } = useCheckoutPromotion();
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
      {pointsRedeemed > 0 ? (
        <PosSummaryRow
          label={
            <span className="inline-flex items-center gap-1.5 text-amber-500">
              {`Đổi điểm (${pointsRedeemed})`}
              <button
                type="button"
                onClick={clearRedeemedPoints}
                aria-label="Bỏ đổi điểm"
                className="text-amber-500/80 transition-colors hover:text-amber-600"
              >
                <CloseIcon size={14} />
              </button>
            </span>
          }
          value={`-${formatVnd(pointsDiscountAmount)}`}
        />
      ) : null}
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
