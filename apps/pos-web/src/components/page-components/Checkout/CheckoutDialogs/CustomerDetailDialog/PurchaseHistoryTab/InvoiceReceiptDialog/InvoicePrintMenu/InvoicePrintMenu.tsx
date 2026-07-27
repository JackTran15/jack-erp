import { useEffect, useRef, useState } from "react";
import { cn } from "@erp/ui";
import { ChevronDownIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface InvoicePrintMenuProps {
  /** Bấm phần thân trái → in ngay, không mở menu. */
  onPrint: () => void;
  /** Chọn "Hủy hóa đơn" trong menu. Bỏ trống → không hiện mục này. */
  onCancelInvoice?: () => void;
  /** Đang in → khóa cả cụm. */
  disabled?: boolean;
}

/**
 * Split-button "In hóa đơn" + caret mở menu, đặt cạnh nút Đóng của biên lai.
 *
 * Menu bung LÊN (`bottom-full`) vì cụm nút nằm sát đáy dialog. Tự quản
 * outside-click / Esc theo pattern `PrintEstimatePopover` — không thêm dependency.
 */
export const InvoicePrintMenu = ({
  onPrint,
  onCancelInvoice,
  disabled,
}: InvoicePrintMenuProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Không có mục nào để hiện thì bỏ luôn caret, tránh menu rỗng.
  const hasMenu = Boolean(onCancelInvoice);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={onPrint}
        disabled={disabled}
        className={cn(
          "inline-flex h-11 items-center justify-center border border-[#E5E7EB] bg-white px-6 text-[14px] font-medium text-[#1F2937] transition-colors",
          "hover:border-[#D1D5DB] hover:bg-[#F9FAFB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          hasMenu ? "rounded-l-lg border-r-0" : "rounded-lg",
        )}
      >
        In hóa đơn
      </button>

      {hasMenu ? (
        <button
          type="button"
          aria-label="Thao tác khác"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className={cn(
            "inline-flex h-11 w-10 items-center justify-center rounded-r-lg border border-[#E5E7EB] bg-white text-[#1F2937] transition-colors",
            "hover:border-[#D1D5DB] hover:bg-[#F9FAFB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 transition-transform",
              open ? "rotate-180" : "",
            )}
          />
        </button>
      ) : null}

      {open && onCancelInvoice ? (
        <div
          role="menu"
          aria-label="Thao tác hóa đơn"
          className="absolute bottom-full right-0 z-[100] mb-2 w-[180px] overflow-hidden rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onCancelInvoice();
            }}
            className="flex w-full items-center px-4 py-2.5 text-left text-[14px] font-medium text-[#DC2626] transition-colors hover:bg-[#FEF2F2] focus:outline-none focus-visible:bg-[#FEF2F2]"
          >
            Hủy hóa đơn
          </button>
        </div>
      ) : null}
    </div>
  );
};
