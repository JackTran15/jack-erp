import { cn } from "@erp/ui";
import type { InvoiceStatus } from "@erp/pos/types/invoice.type";

export interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

const CONFIG: Record<InvoiceStatus, { label: string; bg: string; text: string }> =
  {
    paid: { label: "Đã thanh toán", bg: "bg-[#DCFCE7]", text: "text-[#166534]" },
    debt: { label: "Ghi nợ", bg: "bg-[#FEF3C7]", text: "text-[#92400E]" },
    partial_debt: {
      label: "Nợ một phần",
      bg: "bg-[#FEF3C7]",
      text: "text-[#92400E]",
    },
    pending: { label: "Chờ xử lý", bg: "bg-[#E5E7EB]", text: "text-[#374151]" },
    cancelled: { label: "Đã hủy", bg: "bg-[#FEE2E2]", text: "text-[#B91C1C]" },
    draft: { label: "Nháp", bg: "bg-[#E5E7EB]", text: "text-[#374151]" },
  };

/** Pill trạng thái hóa đơn cho biên lai chi tiết (theo InvoiceStatus). */
export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const c = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-full px-4 text-[13px] font-semibold",
        c.bg,
        c.text,
      )}
    >
      {c.label}
    </span>
  );
}
