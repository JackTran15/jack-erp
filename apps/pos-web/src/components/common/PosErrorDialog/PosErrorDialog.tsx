import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import type { ReactNode } from "react";
import { ProhibitedGlyphIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface PosErrorDialogProps {
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
export function PosErrorDialog({
  open,
  onClose,
  title = "Cảnh báo",
  dismissLabel = "Đóng",
  width = 425,
  message,
  children,
}: PosErrorDialogProps) {
  const body =
    children ??
    (message != null && message !== "" ? (
      <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-gray-800">
        {message}
      </p>
    ) : null);

  return (
    <PosDialog open={open} onClose={onClose} width={width}>
      <PosDialog.Header title={title} />
      <PosDialog.Body className="pt-5">
        <div className="flex gap-4">
          <ProhibitedGlyph />
          {body}
        </div>
      </PosDialog.Body>
      <PosDialog.Footer onCancel={onClose} cancelLabel={dismissLabel} />
    </PosDialog>
  );
}
