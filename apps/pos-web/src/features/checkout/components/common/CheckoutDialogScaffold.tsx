import { DialogTitle, cn } from "@erp/ui";
import type { ReactNode } from "react";

interface CheckoutDialogHeaderProps {
  title: ReactNode;
  className?: string;
  titleClassName?: string;
}

export function CheckoutDialogHeader({
  title,
  className,
  titleClassName,
}: CheckoutDialogHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4",
        className,
      )}
    >
      <DialogTitle
        className={cn(
          "text-[20px] font-semibold leading-tight text-[#1F2937]",
          titleClassName,
        )}
      >
        {title}
      </DialogTitle>
    </header>
  );
}

interface CheckoutDialogFooterProps {
  className?: string;
  onSave?: () => void;
  onCancel: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
}

export function CheckoutDialogFooter({
  className,
  onSave,
  onCancel,
  saveLabel = "Đồng ý",
  cancelLabel = "Đóng",
  saveDisabled,
}: CheckoutDialogFooterProps) {
  return (
    <footer className={cn("flex items-center justify-end gap-2", className)}>
      {onSave ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className={cn(
            "inline-flex h-10 items-center justify-center rounded-lg bg-[#6366F1] px-6 text-[14px] font-semibold text-white transition-colors",
            "hover:bg-[#4F46E5] active:bg-[#4338CA]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:bg-[#C7D2FE]",
          )}
        >
          {saveLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onCancel}
        className={cn(
          "inline-flex h-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-6 text-[14px] font-semibold text-[#0F172A]",
          "transition-colors hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#F1F5F9]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
        )}
      >
        {cancelLabel}
      </button>
    </footer>
  );
}
