import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@erp/ui";
import { GiftIcon, ReceiptIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { useListKeyboardNavigation } from "@erp/pos/hooks/common/use-list-keyboard-navigation";
import {
  PromoMenuOptionEnum,
  type PromoMenuOption,
} from "@erp/pos/constants/checkout.constant";
import {
  DiscountPointDialog,
  type DiscountPointDialogProps,
} from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/DiscountPointDialog/DiscountPointDialog";
import {
  VoucherDialog,
  type VoucherDialogProps,
} from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/VoucherDialog/VoucherDialog";

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

/**
 * Wiring for the "Voucher" dialog mounted by `PromoMenu`. Clicking the
 * "Voucher" entry opens this dialog automatically — the host feeds data /
 * handlers (or omits `voucher` to use the empty-state form).
 */
export type PromoMenuVoucher = Omit<VoucherDialogProps, "open" | "onClose">;

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
  /**
   * Optional payload + handlers for the "Voucher" dialog. When omitted the
   * dialog still opens with an empty form.
   */
  voucher?: PromoMenuVoucher;
}

interface MenuItem {
  key: PromoMenuOption;
  label: string;
  icon: React.ReactNode;
}

const ITEMS: MenuItem[] = [
  {
    key: PromoMenuOptionEnum.PROMO,
    label: "Mã ưu đãi",
    icon: <ReceiptIcon size={18} />,
  },
  { key: PromoMenuOptionEnum.VOUCHER, label: "Voucher", icon: <GiftIcon size={18} /> },
  {
    key: PromoMenuOptionEnum.DISCOUNT,
    label: "Khuyến mãi",
    icon: <GiftIcon size={18} />,
  },
];

/**
 * Small popover anchored under the customer-search action group, matching
 * State 4 in the spec. Caller positions / mounts this — internally it just
 * handles outside-click and Esc dismissal.
 *
 * Two entries are special-cased to open companion dialogs:
 *   • "Mã ưu đãi" → `DiscountPointDialog` (membership + voucher search)
 *   • "Voucher"   → `VoucherDialog` (apply voucher to invoice / items / groups)
 * Selection still propagates via `onSelect` for any side-effects the host
 * wants to attach (announcements, analytics, …).
 */
export function PromoMenu({
  open,
  onClose,
  onSelect,
  discountPoint,
  voucher,
}: PromoMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Dialog state lives inside the menu so the host doesn't need to wire it
  // explicitly — the menu is the single owner of "click X → show dialog X".
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);

  const handlePick = useCallback(
    (key: PromoMenuOption) => {
      if (key === PromoMenuOptionEnum.PROMO) setDiscountDialogOpen(true);
      if (key === PromoMenuOptionEnum.VOUCHER) setVoucherDialogOpen(true);
      onSelect(key);
      onClose();
    },
    [onSelect, onClose],
  );

  const { highlightIdx, setHighlightIdx, handleKeyDown } =
    useListKeyboardNavigation<MenuItem>({
      items: ITEMS,
      open,
      onSelect: (item) => handlePick(item.key),
      onEscape: onClose,
    });

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      // PromoMenu is a popover with no dedicated focusable trigger — focus can
      // be anywhere (e.g. the customer search field). Ignore if the user is
      // typing in another input so native Arrow/Enter still work in those fields.
      const target = e.target as HTMLElement | null;
      const inOtherInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inOtherInput) return;
      handleKeyDown(e);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, handleKeyDown]);

  // Scroll the highlighted item into view (only when needed — the list is short so this rarely fires).
  useEffect(() => {
    if (!open || highlightIdx < 0) return;
    const el = itemRefs.current[highlightIdx];
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
  }, [open, highlightIdx]);

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
            {ITEMS.map((item, idx) => {
              const isHighlighted = idx === highlightIdx;
              return (
                <li
                  key={item.key}
                  className={
                    idx < ITEMS.length - 1
                      ? "border-b border-gray-100"
                      : undefined
                  }
                >
                  <button
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    role="menuitem"
                    aria-selected={isHighlighted}
                    onClick={() => handlePick(item.key)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={cn(
                      "flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-gray-900 transition-colors",
                      isHighlighted ? "bg-indigo-50" : "hover:bg-gray-50",
                    )}
                  >
                    <span className="text-gray-500">{item.icon}</span>
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <DiscountPointDialog
        open={discountDialogOpen}
        onClose={() => setDiscountDialogOpen(false)}
        {...discountPoint}
      />

      <VoucherDialog
        open={voucherDialogOpen}
        onClose={() => setVoucherDialogOpen(false)}
        {...voucher}
      />
    </>
  );
}
