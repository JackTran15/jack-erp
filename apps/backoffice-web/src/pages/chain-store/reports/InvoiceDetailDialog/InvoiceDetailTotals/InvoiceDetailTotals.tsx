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

export function InvoiceDetailTotals({ detail }: Props) {
  const cash = detail.payments
    .filter((p) => p.method === "cash")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const card = detail.payments
    .filter((p) => p.method === "bank_transfer" || p.method === "card")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
      <div className="space-y-1">
        <TotalRow label="Tổng thanh toán" value={detail.totalAmount} bold />
        <TotalRow label="Tiền hàng" value={detail.subtotal} />
      </div>
      <div className="space-y-1">
        <TotalRow label="Khách trả" value={detail.totalPaid} bold />
        <TotalRow label="Thẻ NH/Ví điện tử" value={card} indent />
        <TotalRow label="Tiền mặt" value={cash} indent />
        <TotalRow label="Công nợ" value={detail.debt} bold />
      </div>
    </div>
  );
}
