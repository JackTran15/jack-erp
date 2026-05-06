import { useEffect, useRef, useState } from "react";
import { GiftIcon, ReceiptIcon } from "../icons/Icon";
import {
  DiscountPointDialog,
  type DiscountPointDialogProps,
} from "./discountPoint/DiscountPointDialog";

export type PromoMenuOption = "promo" | "voucher" | "discount";

/**
 * Wiring for the "Mã ưu đãi và điểm" dialog mounted by `PromoMenu`. Clicking
 * the "Mã ưu đãi" entry opens this dialog automatically — the host only has
 * to feed it data + handlers (or omit `discountPoint` entirely to use a
 * minimal guest-state dialog).
 */
export type PromoMenuDiscountPoint = Omit<
  DiscountPointDialogProps,
  "open" | "onClose"
>;

export interface PromoMenuProps {
  /** Visibility — caller (PaymentSummaryPanel) owns the open state. */
  open: boolean;
  /** Close on outside click / Esc / option pick. */
  onClose: () => void;
  /** Pick handler — receives the option key. Caller may close in response. */
  onSelect: (option: PromoMenuOption) => void;
  /**
   * Optional payload + handlers for the "Mã ưu đãi và điểm" dialog. When
   * omitted the dialog still opens but with placeholder member data.
   */
  discountPoint?: PromoMenuDiscountPoint;
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
 *
 * The "Mã ưu đãi" entry is special-cased to open `DiscountPointDialog` (the
 * "Mã ưu đãi và điểm" modal). Selection still propagates via `onSelect` for
 * any side-effects the host wants to attach (announcements, analytics, …).
 */
export function PromoMenu({
  open,
  onClose,
  onSelect,
  discountPoint,
}: PromoMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Dialog state lives inside the menu so the host doesn't need to wire it
  // explicitly — the menu is the single owner of "click promo → show dialog".
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);

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

  const handlePick = (key: PromoMenuOption) => {
    if (key === "promo") setDiscountDialogOpen(true);
    onSelect(key);
    onClose();
  };

  return (
    <>
      {open ? (
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
                  onClick={() => handlePick(item.key)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-gray-900 transition-colors hover:bg-gray-50"
                >
                  <span className="text-gray-500">{item.icon}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DiscountPointDialog
        open={discountDialogOpen}
        onClose={() => setDiscountDialogOpen(false)}
        {...discountPoint}
      />
    </>
  );
}
