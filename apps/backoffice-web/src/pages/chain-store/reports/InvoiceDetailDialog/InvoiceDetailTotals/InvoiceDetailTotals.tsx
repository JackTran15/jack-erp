import type { InvoiceDetailView } from "@erp/shared-interfaces";
import { formatMoney } from "../_lib/format";

interface Props {
  detail: InvoiceDetailView;
}

interface TotalRowProps {
  label: string;
  value: number;
  bold?: boolean;
  indent?: boolean;
}

function TotalRow({ label, value, bold, indent }: TotalRowProps) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span
        className={[
          indent ? "pl-3 font-normal" : "",
          bold ? "font-bold" : "font-normal",
          "text-foreground",
        ].join(" ")}
      >
        {label}
      </span>
      <span className={`tabular-nums ${bold ? "font-bold" : ""}`}>
        {formatMoney(value)}
      </span>
    </div>
  );
}

const sumOf = (detail: InvoiceDetailView, methods: string[]): number =>
  detail.payments
    .filter((p) => methods.includes(p.method))
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

export function InvoiceDetailTotals({ detail }: Props) {
  const cash = sumOf(detail, ["cash"]);
  const card = sumOf(detail, ["bank_transfer", "card"]);
  // Only on a refund: money not paid out but set against the customer's debt,
  // or kept as credit for their next purchase.
  const offset = sumOf(detail, ["offset"]);
  const storeCredit = sumOf(detail, ["store_credit"]);

  // Rows that only exist on some invoices (a header promotion, a delivery fee,
  // points, a deposit, a later debt payment, a refund set off) show when they hold money — the rest of the time they
  // would be a column of zeros. They are what make each side add up:
  // Tiền hàng − Khuyến mại + Phí = Tổng thanh toán, and the tenders = Khách trả.
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
      <div className="space-y-1">
        <TotalRow label="Tổng thanh toán" value={detail.totalAmount} bold />
        <TotalRow label="Tiền hàng" value={detail.subtotal} />
        {detail.discountAmount ? (
          <TotalRow label="Khuyến mại" value={detail.discountAmount} />
        ) : null}
        {detail.shippingFee ? (
          <TotalRow label="Phí giao hàng" value={detail.shippingFee} />
        ) : null}
      </div>
      <div className="space-y-1">
        <TotalRow label="Khách trả" value={detail.totalPaid} bold />
        {detail.depositAmount ? (
          <TotalRow label="Đặt cọc" value={detail.depositAmount} indent />
        ) : null}
        {detail.pointsAmount ? (
          <TotalRow label="Điểm thanh toán" value={detail.pointsAmount} indent />
        ) : null}
        <TotalRow label="Thẻ NH/Ví điện tử" value={card} indent />
        <TotalRow label="Tiền mặt" value={cash} indent />
        {detail.debtCollected ? (
          <TotalRow label="Thu nợ" value={detail.debtCollected} indent />
        ) : null}
        {offset ? <TotalRow label="Bù trừ công nợ" value={offset} indent /> : null}
        {storeCredit ? (
          <TotalRow label="Ghi có cho khách" value={storeCredit} indent />
        ) : null}
        <TotalRow label="Công nợ" value={detail.debt} bold />
      </div>
    </div>
  );
}
