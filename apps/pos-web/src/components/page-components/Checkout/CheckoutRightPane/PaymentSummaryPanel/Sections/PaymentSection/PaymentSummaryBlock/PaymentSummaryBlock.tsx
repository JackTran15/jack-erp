import { formatVnd } from "@erp/ui";
import { CountBadge } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSummaryBlock/CountBadge/CountBadge";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";

export interface PaymentSummaryBlockProps {
  itemCount: number;
  total: number;
  deposit: number;
  amountDue: number;
  onDepositClick?: () => void;
}

/**
 * "Tổng tiền / Đặt cọc / Còn phải thu" block. Item count appears as a
 * small CountBadge inline with the "Tổng tiền" label.
 */
export function PaymentSummaryBlock({
  itemCount,
  total,
  deposit,
  amountDue: _amountDue,
  onDepositClick,
}: PaymentSummaryBlockProps) {
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
