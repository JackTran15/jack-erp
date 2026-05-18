import { cn } from "@erp/ui";
import {
  CheckoutPane,
  selectActiveCheckoutPane,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * "Trả hàng" / "Mua thêm" — only for quick-exchange checkout mode.
 * Đọc và set activeCheckoutPane trực tiếp từ session store.
 */
export function CheckoutExchangeTabs() {
  const activeCheckoutPane = usePosCheckoutSessionStore(selectActiveCheckoutPane);
  const setActiveCheckoutPane = usePosCheckoutSessionStore(
    (s) => s.setActiveCheckoutPane,
  );

  return (
    <div
      role="tablist"
      aria-label="Đổi trả nhanh"
      className="flex w-full shrink-0 gap-0 border-b border-gray-200 bg-white"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeCheckoutPane === CheckoutPane.RETURN}
        className={cn(
          "relative flex min-w-0 flex-1 items-center justify-center py-3 text-[14px] font-medium transition-colors",
          activeCheckoutPane === CheckoutPane.RETURN
            ? "bg-orange-50/90 text-orange-600"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
        )}
        onClick={() => setActiveCheckoutPane(CheckoutPane.RETURN)}
      >
        Trả hàng
        {activeCheckoutPane === CheckoutPane.RETURN ? (
          <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-orange-600" />
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeCheckoutPane === CheckoutPane.PURCHASE}
        className={cn(
          "relative flex min-w-0 flex-1 items-center justify-center py-3 text-[14px] font-medium transition-colors",
          activeCheckoutPane === CheckoutPane.PURCHASE
            ? "bg-emerald-50/90 text-emerald-800"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
        )}
        onClick={() => setActiveCheckoutPane(CheckoutPane.PURCHASE)}
      >
        Mua thêm
        {activeCheckoutPane === CheckoutPane.PURCHASE ? (
          <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-600" />
        ) : null}
      </button>
    </div>
  );
}
