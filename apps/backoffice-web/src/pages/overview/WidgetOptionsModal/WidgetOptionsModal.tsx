import { AppModal, Button } from "@erp/ui";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  /** Đóng modal và bỏ bản nháp. */
  onClose: () => void;
  /** Commit bản nháp vào store. */
  onConfirm: () => void;
  width: number;
  height: number;
  children: ReactNode;
}

/**
 * Vỏ chung của modal "Tùy chọn" trên mọi widget: tiêu đề cố định, form dọc và
 * cặp nút "Đồng ý" / "Hủy bỏ".
 *
 * Modal làm việc trên bản nháp — component cha giữ `useState` copy của state
 * widget và chỉ gọi `onConfirm` khi người dùng bấm "Đồng ý".
 */
export function WidgetOptionsModal({
  open,
  onClose,
  onConfirm,
  width,
  height,
  children,
}: Props) {
  return (
    <AppModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Tùy chọn"
      defaultWidth={width}
      defaultHeight={height}
      minHeight={160}
      bodyStretch={false}
      preventOutsideClose
      footer={
        <div className="flex w-full items-center justify-end gap-4">
          <Button type="button" onClick={onConfirm}>
            <Check className="mr-2 h-4 w-4" />
            Đồng ý
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            <X className="mr-2 h-4 w-4" />
            Hủy bỏ
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-1 pt-1">{children}</div>
    </AppModal>
  );
}
