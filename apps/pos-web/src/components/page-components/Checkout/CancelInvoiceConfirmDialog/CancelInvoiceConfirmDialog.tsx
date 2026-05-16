import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { WarningIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface CancelInvoiceConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user confirms cancellation (primary / "Có"). */
  onConfirm: () => void;
}

/** Confirmation dialog before discarding the in-progress return / exchange invoice. */
export function CancelInvoiceConfirmDialog({
  open,
  onClose,
  onConfirm,
}: CancelInvoiceConfirmDialogProps) {
  return (
    <PosDialog
      open={open}
      onClose={onClose}
      width={440}
      contentClassName="max-w-[95vw]"
    >
      <PosDialog.Header title="Cảnh báo" />
      <PosDialog.Body>
        <div className="flex gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600"
            aria-hidden
          >
            <WarningIcon size={20} />
          </span>
          <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-gray-700">
            Bạn có muốn hủy bỏ hóa đơn đang lập không?
          </p>
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={onConfirm}
        onCancel={onClose}
        saveLabel="Có"
        cancelLabel="Không"
      />
    </PosDialog>
  );
}
