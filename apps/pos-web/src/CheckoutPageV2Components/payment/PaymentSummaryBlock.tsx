import { CountBadge } from "../common/CountBadge";
import { formatVnd } from "../utils";
import { SummaryRow } from "./SummaryRow";

export interface PaymentSummaryBlockProps {
  itemCount: number;
  total: number;
  deposit: number;
  amountDue: number;
}

/**
 * "Tổng tiền / Đặt cọc / Còn phải thu" block. Item count appears as a
 * small CountBadge inline with the "Tổng tiền" label.
 */
export function PaymentSummaryBlock({
  itemCount,
  total,
  deposit,
  amountDue,
}: PaymentSummaryBlockProps) {
  return (
    <div className="space-y-2 py-3">
      <SummaryRow
        label={
          <span className="inline-flex items-center gap-1.5">
            Tổng tiền <CountBadge>{itemCount}</CountBadge>
          </span>
        }
        value={formatVnd(total)}
        emphasis="strong"
      />
      <SummaryRow
        label="Đặt cọc"
        value={formatVnd(deposit)}
      />
      <div className="border-t border-gray-200 pt-3">
        <SummaryRow
          label={<span className="font-medium text-gray-900">Còn phải thu</span>}
          value={formatVnd(amountDue)}
          emphasis="xl"
        />
      </div>
    </div>
  );
}
