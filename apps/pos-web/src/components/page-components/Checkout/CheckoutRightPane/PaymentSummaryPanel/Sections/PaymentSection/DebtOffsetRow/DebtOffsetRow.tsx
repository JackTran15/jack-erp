import { formatVnd } from "@erp/ui";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";
import { useOutstandingDebtQuery } from "@erp/pos/hooks/react-query/use-query-invoice";
import {
  selectActiveSession,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface DebtOffsetRowProps {
  /** Tổng khoản hoàn của phiếu trả (số dương). */
  refundAmount: number;
}

/**
 * Xem trước cách khoản hoàn được tách khi hóa đơn gốc còn nợ: trừ công nợ trước,
 * phần còn lại mới chi ra quỹ. Đây đúng là phép tính BE chạy lúc tất toán, chỉ
 * khác là BE đọc dư nợ dưới khoá — nếu quầy khác vừa thu nợ thì số trên chứng từ
 * mới là số cuối cùng.
 *
 * Hóa đơn không còn nợ (hoặc chưa tải được dư nợ) thì không hiện gì: thu ngân
 * vẫn xác nhận được như cũ.
 */
export function DebtOffsetRow({ refundAmount }: DebtOffsetRowProps) {
  const originalInvoiceId = usePosCheckoutSessionStore(
    (s) => selectActiveSession(s)?.originalInvoiceId,
  );
  const { data } = useOutstandingDebtQuery(originalInvoiceId);

  const remainingDebt = data?.remainingDebt ?? 0;
  if (remainingDebt <= 0 || refundAmount <= 0) return null;

  const offset = Math.min(refundAmount, remainingDebt);
  const cashOut = refundAmount - offset;

  return (
    <div className="border-t border-gray-200 px-4 py-2">
      <PosSummaryRow
        label={<span className="text-gray-600">Trừ công nợ</span>}
        value={
          <span className="font-semibold text-gray-900">
            {formatVnd(offset)}
          </span>
        }
      />
      <PosSummaryRow
        label={<span className="text-gray-600">Chi trả khách</span>}
        value={
          <span className="font-semibold text-gray-900">
            {formatVnd(cashOut)}
          </span>
        }
      />
    </div>
  );
}
