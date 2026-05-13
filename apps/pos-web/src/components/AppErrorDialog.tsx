import { AppDialog } from "@erp/pos/components/AppDialog";
import type { ReactNode } from "react";
import { ProhibitedGlyphIcon } from "./icons/Icon";

export interface AppErrorDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  dismissLabel?: string;
  width?: number;
  message?: string;
  children?: ReactNode;
}

function ProhibitedGlyph() {
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-500 bg-red-300"
      aria-hidden
    >
      <ProhibitedGlyphIcon />
    </span>
  );
}
export function AppErrorDialog({
  open,
  onClose,
  title = "Cảnh báo",
  dismissLabel = "Đóng",
  width = 425,
  message,
  children,
}: AppErrorDialogProps) {
  const body =
    children ??
    (message != null && message !== "" ? (
      <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-gray-800">
        {message}
      </p>
    ) : null);

  return (
    <AppDialog open={open} onClose={onClose} width={width}>
      <AppDialog.Header title={title} />
      <AppDialog.Body className="pt-5">
        <div className="flex gap-4">
          <ProhibitedGlyph />
          {body}
        </div>
      </AppDialog.Body>
      <AppDialog.Footer onCancel={onClose} cancelLabel={dismissLabel} />
    </AppDialog>
  );
}
