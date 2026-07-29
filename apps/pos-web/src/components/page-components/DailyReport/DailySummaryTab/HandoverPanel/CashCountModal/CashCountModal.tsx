import { useEffect, useState } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { CASH_DENOMINATIONS } from "@erp/pos/constants/daily-report.constant";
import { formatNumberVi } from "@erp/pos/lib/page-libs/daily-report/formatDailyReport";
import type { CashCountState } from "@erp/pos/interfaces/daily-report.interface";

export interface CashCountModalProps {
  open: boolean;
  value: CashCountState;
  onClose: () => void;
  /** Confirm — reports the counted total and the per-denomination counts. */
  onApply: (total: number, counts: CashCountState) => void;
}

const sumCounts = (counts: CashCountState): number =>
  CASH_DENOMINATIONS.reduce((s, d) => s + d * (counts[d] ?? 0), 0);

/**
 * "Chi tiết kiểm đếm" — count cash by denomination → total → "Tiền bàn giao".
 * Fixed table layout: Mệnh giá + Số lượng get fixed widths; Thành tiền takes
 * whatever width remains.
 */
export function CashCountModal({
  open,
  value,
  onClose,
  onApply,
}: CashCountModalProps) {
  const [counts, setCounts] = useState<CashCountState>({});

  useEffect(() => {
    if (open) setCounts(value);
  }, [open, value]);

  const total = sumCounts(counts);

  return (
    <PosDialog open={open} onClose={onClose} width={480}>
      <PosDialog.Header title="Chi tiết kiểm đếm" />
      <PosDialog.Body>
        <table className="w-full table-fixed text-[14px]">
          <colgroup>
            <col style={{ width: 140 }} />
            <col style={{ width: 120 }} />
            <col />
          </colgroup>
          <thead>
            <tr className="text-[#6B7280]">
              <th className="pb-2 text-left font-medium">Mệnh giá</th>
              <th className="pb-2 text-center font-medium">Số lượng</th>
              <th className="pb-2 text-right font-medium">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {CASH_DENOMINATIONS.map((denom) => {
              const qty = counts[denom] ?? 0;
              return (
                <tr key={denom} className="border-t border-[#F1F2F4]">
                  <td className="py-2">
                    <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#EEF0FB] px-2 py-1 font-medium text-[#4F46E5]">
                      {formatNumberVi(denom)} đ
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      value={qty === 0 ? "" : qty}
                      onChange={(e) => {
                        const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                        setCounts((prev) => ({ ...prev, [denom]: n }));
                      }}
                      className="h-9 w-24 rounded-md border border-[#E1E3EA] px-2 text-right focus:border-[#6366F1] focus:outline-none"
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums text-[#1F2233]">
                    {formatNumberVi(denom * qty)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#E5E7EB] font-semibold">
              <td className="py-2">Tổng tiền</td>
              <td />
              <td className="py-2 text-right tabular-nums">{formatNumberVi(total)}</td>
            </tr>
          </tfoot>
        </table>
      </PosDialog.Body>
      <PosDialog.Footer
        saveLabel="Đồng ý"
        cancelLabel="Đóng"
        onCancel={onClose}
        onSave={() => onApply(total, counts)}
      />
    </PosDialog>
  );
}
