import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@erp/ui";
import { GiftIcon, ReceiptIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { useListKeyboardNavigation } from "@erp/pos/hooks/common/use-list-keyboard-navigation";
import {
  PromoMenuOptionEnum,
  type PromoMenuOption,
} from "@erp/pos/constants/checkout.constant";
import { POINT_REDEMPTION_VALUE_VND } from "@erp/pos/constants/loyalty.constant";
import { DiscountPointDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DiscountPointDialog/DiscountPointDialog";
import { VoucherDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/VoucherDialog/VoucherDialog";
import { useCheckoutPromotion } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-promotion";
import { useCustomerSummary } from "@erp/pos/hooks/react-query/use-query-customer";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerUtils";
import { lineTotal } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import {
  computeVoucherLineSource,
  selectCustomerDraft,
  selectPromotionDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface PromoMenuProps {
  /** Visibility — caller (PaymentSummaryPanel) owns the open state. */
  open: boolean;
  /** Close on outside click / Esc / option pick. */
  onClose: () => void;
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
 * Small popover anchored under the customer-search action group. Two entries
 * special-case to open companion dialogs (DiscountPointDialog, VoucherDialog);
 * còn lại các handlers (announce, voucher data) đọc trực tiếp từ promotion
 * hook + session/customer stores.
 */
export function PromoMenu({ open, onClose }: PromoMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const {
    pickPromoOption,
    searchVoucher,
    applyVoucher,
    setRedeemedPoints,
    clearRedeemedPoints,
  } = useCheckoutPromotion();
  const selectedCustomer = usePosCheckoutSessionStore(
    (s) => selectCustomerDraft(s).selectedCustomer,
  );
  const pointsRedeemed = usePosCheckoutSessionStore(
    (s) => selectPromotionDraft(s).pointsRedeemed,
  );
  const sessionState = usePosCheckoutSessionStore();
  const voucherLines = useMemo(
    () => computeVoucherLineSource(sessionState),
    [sessionState],
  );

  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);

  // Fetch summary chỉ khi dialog đang mở và có khách hàng → tránh request thừa
  // khi cashier đóng popover hoặc chưa chọn khách. `useCustomer*` đã dedup theo
  // cache + 30s staleTime, nên mở lại dialog cùng khách không gọi lại API.
  const summaryEnabled = discountDialogOpen && Boolean(selectedCustomer?.id);
  const { data: summary } = useCustomerSummary(
    summaryEnabled ? selectedCustomer?.id : undefined,
  );

  const discountData = useMemo(() => {
    if (!selectedCustomer) return undefined;
    return {
      member: {
        name: formatCustomerDisplay(selectedCustomer),
        cardNumber: summary?.membership?.cardNumber ?? null,
        totalSpent: summary?.purchases.totalSpending ?? 0,
        loyaltyPoints: summary?.membership?.points ?? 0,
        pointsUsed: pointsRedeemed,
        pointsRate: POINT_REDEMPTION_VALUE_VND,
      },
    };
  }, [selectedCustomer, summary, pointsRedeemed]);

  const canApplyPoints = Boolean(
    selectedCustomer && summary?.membership && summary.membership.points > 0,
  );

  const handlePick = useCallback(
    (key: PromoMenuOption) => {
      if (key === PromoMenuOptionEnum.PROMO) setDiscountDialogOpen(true);
      if (key === PromoMenuOptionEnum.VOUCHER) setVoucherDialogOpen(true);
      pickPromoOption(key);
      onClose();
    },
    [pickPromoOption, onClose],
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
        data={discountData}
        onSearchVoucher={searchVoucher}
        onApply={setRedeemedPoints}
        onClear={clearRedeemedPoints}
        hasApplied={pointsRedeemed > 0}
        canApply={canApplyPoints}
      />

      <VoucherDialog
        open={voucherDialogOpen}
        onClose={() => setVoucherDialogOpen(false)}
        data={{
          items: voucherLines.map((l) => ({
            id: l.lineId,
            name: l.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineTotal: lineTotal(l),
          })),
        }}
        onApply={applyVoucher}
      />
    </>
  );
}
