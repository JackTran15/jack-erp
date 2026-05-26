import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";

export interface ReturnFeeDialogProps {
  open: boolean;
  amount: number;
  onClose: () => void;
  onAmountChange: (next: number) => void;
  onConfirm: () => void;
}

/**
 * Nhập phí đổi trả (chỉ tab return / quick-exchange). Số tiền per-tab, cộng vào
 * settlement → "Còn phải thu" / "Trả lại khách" tự cập nhật. Mirror DepositDialog
 * nhưng chỉ có ô số tiền (phí không gắn phương thức thanh toán).
 */
export function ReturnFeeDialog({
  open,
  amount,
  onClose,
  onAmountChange,
  onConfirm,
}: ReturnFeeDialogProps) {
  return (
    <PosDialog open={open} onClose={onClose} width={560}>
      <PosDialog.Header title="Phí đổi trả" />
      <PosDialog.Body className="space-y-4">
        <PosNumberInput
          label="Số tiền phí đổi trả"
          fieldLayout="horizontal"
          labelClassName="w-1/2"
          value={amount}
          onChange={(next) => onAmountChange(Math.max(0, next))}
          inputMode="numeric"
          variant="underline"
          ariaLabel="Số tiền phí đổi trả"
        />
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={onConfirm}
        onCancel={onClose}
        saveLabel="Đồng ý"
        cancelLabel="Đóng"
      />
    </PosDialog>
  );
}
