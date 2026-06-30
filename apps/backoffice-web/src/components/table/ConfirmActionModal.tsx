import { AppModal, Button } from "@erp/ui";
import { Trash2 } from "lucide-react";

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
  const isDeleteAction = /xoá|xóa/i.test(confirmLabel);

  return (
    <AppModal
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={title}
      bodyStretch={false}
      defaultWidth={420}
      defaultHeight={190}
      minWidth={360}
      minHeight={170}
      bodyClassName="overflow-visible"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDeleteAction ? "destructive" : "default"}
            disabled={loading}
            onClick={onConfirm}
          >
            {isDeleteAction ? <Trash2 className="mr-2 h-4 w-4" /> : null}
            {loading ? "Đang xử lý…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-muted-foreground leading-relaxed">{message}</p>
    </AppModal>
  );
}
