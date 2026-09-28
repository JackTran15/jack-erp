import { cn } from "@erp/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatEInvoiceMoney } from "../../_lib/einvoice-columns";
import type { EInvoiceLine } from "../../_lib/einvoice.interface";

interface Props {
  lines: EInvoiceLine[];
  promotionTotal: number;
  total: number;
  /** Mở rộng: bảng chiếm chỗ của form (modal ẩn tab + form). */
  expanded: boolean;
  onToggle: () => void;
}

const HEADERS = [
  { label: "STT", className: "w-[50px] text-center" },
  { label: "Mã SKU", className: "w-[120px]" },
  { label: "Tên hàng hóa", className: "" },
  { label: "ĐVT", className: "w-[80px]" },
  { label: "Số lượng", className: "w-[80px] text-right" },
  { label: "Đơn giá", className: "w-[100px] text-right" },
  { label: "Tiền hàng", className: "w-[110px] text-right" },
  { label: "Thành tiền", className: "w-[110px] text-right" },
];

const CELL = "h-8 border border-border px-2.5";

/** "Xem thêm / Thu gọn DS hàng hóa" + bảng hàng hóa chỉ đọc + dòng tổng. */
export function InvoiceLinesSection({ lines, promotionTotal, total, expanded, onToggle }: Props) {
  return (
    <div className={cn("flex flex-col", expanded && "min-h-0 flex-1")}>
      <div className="relative flex h-8 items-center justify-center">
        <span className="absolute inset-x-0 top-1/2 border-t" aria-hidden />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="relative inline-flex items-center gap-1 bg-background px-4 text-[13px] font-semibold text-primary-blue hover:underline"
        >
          {expanded ? "Thu gọn DS hàng hóa" : "Xem thêm DS hàng hóa"}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      <div
        className={cn(
          "overflow-y-auto border",
          expanded ? "min-h-0 flex-1" : "max-h-[112px]",
        )}
      >
        <table className="w-full table-fixed border-collapse text-[13px] leading-5">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {HEADERS.map((h) => (
                <th key={h.label} className={cn(CELL, "font-bold", h.className, "text-center")}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={`${l.sku}-${i}`} className="even:bg-muted/50">
                <td className={cn(CELL, "text-center")}>{i + 1}</td>
                <td className={CELL}>{l.sku}</td>
                <td className={cn(CELL, "truncate")}>{l.name}</td>
                <td className={CELL}>{l.unit}</td>
                <td className={cn(CELL, "text-right tabular-nums")}>{l.quantity}</td>
                <td className={cn(CELL, "text-right tabular-nums")}>{formatEInvoiceMoney(l.unitPrice)}</td>
                <td className={cn(CELL, "text-right tabular-nums")}>{formatEInvoiceMoney(l.goodsAmount)}</td>
                <td className={cn(CELL, "text-right tabular-nums")}>{formatEInvoiceMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex h-10 items-center gap-6 bg-muted px-2 text-[13px] font-bold">
        <span className="mr-auto">Số dòng = {lines.length}</span>
        <span>
          Tổng tiền khuyến mại:
          <span className="ml-6 tabular-nums">{formatEInvoiceMoney(promotionTotal)}</span>
        </span>
        <span className="ml-16">
          Tổng tiền thanh toán:
          <span className="ml-6 tabular-nums">{formatEInvoiceMoney(total)}</span>
        </span>
      </div>
    </div>
  );
}
