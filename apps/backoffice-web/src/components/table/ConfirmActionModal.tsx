import { AppModal } from "@erp/ui";

interface ConfirmActionModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionModal({
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  return (
    <AppModal
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={title}
      onSave={onConfirm}
      onCancel={onCancel}
      saveLabel={loading ? "Đang xử lý…" : confirmLabel}
      cancelLabel={cancelLabel}
      saveDisabled={loading}
    >
      <p className="text-muted-foreground leading-relaxed">{message}</p>
    </AppModal>
  );
}
