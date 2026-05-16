import { cn, Dialog, DialogContent, DialogTitle } from "@erp/ui";
import { CSSProperties, ReactNode, RefObject, useEffect, useRef } from "react";

export interface PosDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  /**
   * Ref to the element that receives focus when the dialog closes, overrides
   * `document.activeElement` captured at open time. Use when the trigger may
   * unmount (e.g. a button hidden by a filter after state changes) or when a
   * hotkey-opened modal should return focus to a different element.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /**
   * Ref to the element that receives focus when the dialog opens, overrides
   * the Radix default (first focusable). Use for form modals that want to
   * focus directly on the primary input instead of the close button or a
   * read-only field. If the element is an input/textarea, existing text will
   * be selected so it can be typed over.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export interface PosDialogHeaderProps {
  title: ReactNode;
  className?: string;
  titleClassName?: string;
}

export interface PosDialogBodyProps {
  className?: string;
  children?: ReactNode;
}

export interface PosDialogFooterProps {
  className?: string;
  /** Click handler for the primary button. Ignored when `saveFormId` is set. */
  onSave?: () => void;
  onCancel: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  /**
   * When set, the primary button renders as `<button type="submit" form={id}>`
   * so the host's `<form id={id}>` `onSubmit` fires natively. Use this for
   * form-bound modals so Enter-key submission works.
   */
  saveFormId?: string;
}

const BASE_CONTENT_CLASSES =
  "flex max-h-[90vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 rounded-lg shadow-[0_20px_48px_rgba(15,23,42,0.12)]";

export function PosDialog({
  open,
  onClose,
  children,
  width = 880,
  contentClassName,
  contentStyle,
  ariaLabelledBy,
  ariaDescribedBy,
  returnFocusTo,
  initialFocusRef,
}: PosDialogProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const active = document.activeElement;
      previousFocusRef.current =
        active instanceof HTMLElement ? active : null;
    }
    wasOpenRef.current = open;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        style={{ maxWidth: `${width}px`, ...contentStyle }}
        className={cn(BASE_CONTENT_CLASSES, contentClassName)}
        onOpenAutoFocus={(event) => {
          const target = initialFocusRef?.current;
          if (target && typeof target.focus === "function") {
            event.preventDefault();
            target.focus();
            if (
              target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement
            ) {
              target.select();
            }
          }
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.current ?? previousFocusRef.current;
          if (
            target &&
            document.contains(target) &&
            typeof target.focus === "function"
          ) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

PosDialog.Header = ({
  title,
  className,
  titleClassName,
}: PosDialogHeaderProps) => {
  return (
    <header
      className={cn(
        "flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4 bg-white",
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
};

PosDialog.Body = ({ className, children }: PosDialogBodyProps) => {
  return <div className={cn("flex-1 p-6 pt-4 overflow-y-auto", className)}>{children}</div>;
}

PosDialog.Footer = ({
  className,
  onSave,
  onCancel,
  saveLabel = "Đồng ý",
  cancelLabel = "Đóng",
  saveDisabled,
  saveFormId,
}: PosDialogFooterProps) => {
  const showSave = Boolean(onSave || saveFormId);
  return (
    <footer className={cn("flex items-center justify-end gap-2 h-16 border-t border-gray-200 bg-white px-6", className)}>
      {showSave ? (
        <button
          type={saveFormId ? "submit" : "button"}
          form={saveFormId}
          onClick={saveFormId ? undefined : onSave}
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
};