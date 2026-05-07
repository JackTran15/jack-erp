import { cn, formatVnd } from "@erp/ui";
import type { DraftInvoice } from "../types";
import { DRAFT_ZIGZAG_CLIP_PATH, draftLineDescription } from "./viewUtils";

interface InvoiceDetailPanelProps {
  draft: DraftInvoice | null;
}

export function InvoiceDetailPanel({ draft }: InvoiceDetailPanelProps) {
  return (
    <div
      role="region"
      aria-label="Chi tiết hóa đơn"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border border-[#E6E8EE] bg-white",
        "rounded-t-lg",
        "shadow-[0_1px_2px_rgba(15,20,36,0.04)]",
      )}
      style={{ clipPath: DRAFT_ZIGZAG_CLIP_PATH, paddingBottom: 6 }}
    >
      <div
        className={cn(
          "grid bg-[#F7F8FA] px-6 py-3 text-[14px] font-semibold text-[#4B5163]",
          "grid-cols-[1fr_80px_100px_100px] gap-4",
        )}
        role="row"
      >
        <div role="columnheader">Tên hàng hóa</div>
        <div role="columnheader" className="text-right">
          Số lượng
        </div>
        <div role="columnheader" className="text-right">
          Đơn giá
        </div>
        <div role="columnheader" className="text-right">
          Thành tiền
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!draft || draft.lines.length === 0 ? (
          <p className="px-6 py-12 text-center text-[14px] italic text-[#9CA0AB]">
            Chọn một hóa đơn để xem chi tiết
          </p>
        ) : (
          draft.lines.map((line, idx) => (
            <div
              key={line.lineId}
              role="row"
              className={cn(
                "grid gap-4 px-6 py-3.5 text-[14px] text-[#1F2233]",
                "grid-cols-[1fr_80px_100px_100px]",
                idx % 2 === 1 ? "bg-[#F7F7FA]" : "bg-white",
              )}
            >
              <div role="gridcell" className="flex flex-col gap-0.5">
                <span className="font-semibold text-[#1F2233]">
                  {line.code || line.name}
                </span>
                <span className="text-[13px] text-[#4B5163]">
                  {draftLineDescription(line)}
                </span>
              </div>
              <div role="gridcell" className="text-right tabular-nums">
                {line.qty}
              </div>
              <div role="gridcell" className="text-right tabular-nums">
                {formatVnd(line.unitPrice)}
              </div>
              <div role="gridcell" className="text-right tabular-nums">
                {formatVnd(line.unitPrice * line.qty)}
              </div>
            </div>
          ))
        )}
      </div>

      {draft && draft.payments && draft.payments.length > 0 ? (
        <div className="border-t border-[#E6E8EE] px-6 py-3">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#4B5163]">
            Phương thức thanh toán
          </div>
          <ul className="flex flex-col gap-1">
            {draft.payments.map((p, i) => (
              <li
                key={`${p.method}-${i}`}
                className="flex items-center justify-between text-[14px] text-[#1F2233]"
              >
                <span>{p.label}</span>
                <span className="tabular-nums">{formatVnd(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {draft ? (
        <div className="flex items-center justify-between border-t border-[#E6E8EE] px-6 py-4">
          <span className="text-[14px] font-medium text-[#4B5163]">Tổng tiền</span>
          <span className="text-[20px] font-bold leading-[1.2] tracking-[-0.01em] text-[#0F1424] tabular-nums">
            {formatVnd(draft.total)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
