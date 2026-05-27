import { useCallback, useState } from "react";

import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import {
  INVOICE_LIST_COLUMN_LABELS,
  INVOICE_LIST_COLUMN_ORDER,
  InvoiceListColumnKey,
} from "@erp/pos/constants/invoice-list.constant";

export interface InvoiceColumnSettingsDialogProps {
  open: boolean;
  visibleColumns: ReadonlySet<InvoiceListColumnKey>;
  onApply: (next: ReadonlySet<InvoiceListColumnKey>) => void;
  onClose: () => void;
}

/**
 * Modal "Thiết lập cột hiển thị" — chỉ bật/tắt cột (không kéo-thả). Giữ buffer
 * nội bộ để "Đóng" không áp dụng; "Đồng ý" mới commit qua `onApply`.
 */
export function InvoiceColumnSettingsDialog({
  open,
  visibleColumns,
  onApply,
  onClose,
}: InvoiceColumnSettingsDialogProps) {
  const [buffer, setBuffer] = useState<Set<InvoiceListColumnKey>>(
    () => new Set(visibleColumns),
  );

  const reset = useCallback(() => {
    setBuffer(new Set(visibleColumns));
  }, [visibleColumns]);
  useDialogReset(open, reset);

  const toggle = (key: InvoiceListColumnKey, checked: boolean) =>
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
          {INVOICE_LIST_COLUMN_ORDER.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between py-3 text-[15px] text-[#1F2937]"
            >
              <span>{INVOICE_LIST_COLUMN_LABELS[key]}</span>
              <PosCheckbox
                size="md"
                checked={buffer.has(key)}
                onChange={(checked) => toggle(key, checked)}
                ariaLabel={`Hiển thị cột ${INVOICE_LIST_COLUMN_LABELS[key]}`}
              />
            </li>
          ))}
        </ul>
      </PosDialog.Body>
      <PosDialog.Footer onSave={() => onApply(buffer)} onCancel={onClose} />
    </PosDialog>
  );
}
