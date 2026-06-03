import { useEffect, useRef } from "react";
import { cn } from "@erp/ui";

export interface PrintEstimatePopoverProps {
  /** Visibility — caller (PaymentCTAButtons) owns open state. */
  open: boolean;
  /** Close on outside click / Esc. */
  onClose: () => void;
  /** Chọn "In Tạm Tính" → tạo draft + in bản tạm tính. */
  onPick: () => void;
  /** Vô hiệu hóa item khi giỏ trống / đang in. */
  disabled?: boolean;
}

/**
 * Popover bong bóng (có đuôi nhọn trỏ xuống caret) neo phía trên cụm split-button
 * "Lưu tạm". Một item duy nhất "In Tạm Tính (Alt + P)". Đóng khi click ngoài / Esc.
 * Theo pattern `PromoMenu` — div absolute tự quản outside-click, không thêm dep.
 */
export function PrintEstimatePopover({
  open,
  onClose,
  onPick,
  disabled,
}: PrintEstimatePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="In tạm tính"
      className="absolute bottom-full left-0 z-[100] mb-3 w-[210px]"
    >
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => onPick()}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-[#4F46E5] px-5 py-4 text-center font-bold text-white shadow-[0_8px_24px_rgba(79,70,229,0.30)] transition-colors",
          "hover:bg-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className="text-[16px] leading-tight">In Tạm Tính</span>
        <span className="text-[12px] font-medium text-white/80">(Alt + P)</span>
      </button>
      {/* Đuôi nhọn trỏ xuống caret */}
      <span
        aria-hidden
        className="absolute left-6 top-full -mt-px h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-[#4F46E5]"
      />
    </div>
  );
}
