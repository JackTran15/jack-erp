import { useCallback, useState } from "react";

import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import {
  DAILY_REPORT_REVENUE_COLUMN_LABELS,
  DAILY_REPORT_REVENUE_COLUMN_ORDER,
  DailyReportRevenueColumnKey,
} from "@erp/pos/constants/daily-report.constant";

export interface RevenueColumnSettingsDialogProps {
  open: boolean;
  visibleColumns: ReadonlySet<DailyReportRevenueColumnKey>;
  onApply: (next: ReadonlySet<DailyReportRevenueColumnKey>) => void;
  onClose: () => void;
}

/**
 * Modal "Thiết lập cột hiển thị" cho bảng "Doanh thu theo mặt hàng" — chỉ
 * bật/tắt cột (không kéo-thả). Giữ buffer nội bộ để "Đóng" không áp dụng;
 * "Đồng ý" mới commit qua `onApply`. Mirrors InvoiceColumnSettingsDialog.
 */
export function RevenueColumnSettingsDialog({
  open,
  visibleColumns,
  onApply,
  onClose,
}: RevenueColumnSettingsDialogProps) {
  const [buffer, setBuffer] = useState<Set<DailyReportRevenueColumnKey>>(
    () => new Set(visibleColumns),
  );

  const reset = useCallback(() => {
    setBuffer(new Set(visibleColumns));
  }, [visibleColumns]);
  useDialogReset(open, reset);

  const toggle = (key: DailyReportRevenueColumnKey, checked: boolean) =>
    setBuffer((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <PosDialog open={open} onClose={onClose} width={520}>
      <PosDialog.Header title="Thiết lập cột hiển thị" />
      <PosDialog.Body className="pt-2">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2 text-[13px] font-medium text-[#6B7280]">
          <span>Tên cột</span>
          <span>Hiển thị</span>
        </div>
        <ul>
          {DAILY_REPORT_REVENUE_COLUMN_ORDER.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between py-3 text-[15px] text-[#1F2937]"
            >
              <span>{DAILY_REPORT_REVENUE_COLUMN_LABELS[key]}</span>
              <PosCheckbox
                size="md"
                checked={buffer.has(key)}
                onChange={(checked) => toggle(key, checked)}
                ariaLabel={`Hiển thị cột ${DAILY_REPORT_REVENUE_COLUMN_LABELS[key]}`}
              />
            </li>
          ))}
        </ul>
      </PosDialog.Body>
      <PosDialog.Footer onSave={() => onApply(buffer)} onCancel={onClose} />
    </PosDialog>
  );
}
