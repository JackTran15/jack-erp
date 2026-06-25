import type { InvoiceDetailView } from "@erp/shared-interfaces";
import { formatDateTime } from "../_lib/format";

interface Props {
  detail: InvoiceDetailView;
}

interface MetaRowProps {
  label: string;
  value: string;
}

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div className="flex gap-1 text-[13px] leading-relaxed">
      <span className="font-bold text-foreground">{label}:</span>
      <span className="text-muted-foreground">{value || "—"}</span>
    </div>
  );
}

export function InvoiceDetailMeta({ detail }: Props) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
      <div className="space-y-1">
        <MetaRow label="Số" value={detail.code} />
        <MetaRow label="Thu ngân" value={detail.cashier ?? ""} />
        <MetaRow label="Khách hàng" value={detail.customerName ?? ""} />
        <MetaRow label="Thẻ khách hàng" value={detail.customerGroup ?? ""} />
      </div>
      <div className="space-y-1">
        <MetaRow label="Ngày" value={formatDateTime(detail.issuedAt)} />
        <MetaRow label="Điện thoại" value={detail.customerPhone ?? ""} />
        <MetaRow label="Kênh bán hàng" value={detail.salesChannel ?? ""} />
      </div>
    </div>
  );
}
