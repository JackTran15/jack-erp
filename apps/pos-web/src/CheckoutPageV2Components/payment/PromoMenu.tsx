import { useEffect, useRef } from "react";
import { GiftIcon, ReceiptIcon } from "../icons/Icon";

export type PromoMenuOption = "promo" | "voucher" | "discount";

export interface PromoMenuProps {
  /** Visibility — caller (PaymentSummaryPanel) owns the open state. */
  open: boolean;
  /** Close on outside click / Esc / option pick. */
  onClose: () => void;
  /** Pick handler — receives the option key. Caller may close in response. */
  onSelect: (option: PromoMenuOption) => void;
}

interface MenuItem {
  key: PromoMenuOption;
  label: string;
  icon: React.ReactNode;
}

const ITEMS: MenuItem[] = [
  { key: "promo", label: "Mã ưu đãi", icon: <ReceiptIcon size={18} /> },
  { key: "voucher", label: "Voucher", icon: <GiftIcon size={18} /> },
  { key: "discount", label: "Khuyến mãi", icon: <GiftIcon size={18} /> },
];

/**
 * Small popover anchored under the customer-search action group, matching
 * State 4 in the spec. Caller positions / mounts this — internally it just
 * handles outside-click and Esc dismissal.
 */
export function PromoMenu({ open, onClose, onSelect }: PromoMenuProps) {
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
      aria-label="Mã ưu đãi"
      className="absolute right-0 top-full z-[100] mt-1 w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
    >
      <ul className="py-1">
        {ITEMS.map((item, idx) => (
          <li
            key={item.key}
            className={
              idx < ITEMS.length - 1
                ? "border-b border-gray-100"
                : undefined
            }
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(item.key);
                onClose();
              }}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-gray-900 transition-colors hover:bg-gray-50"
            >
              <span className="text-gray-500">{item.icon}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
