import { cn } from "@erp/ui";
import { ExchangePane } from "@erp/pos/stores/usePosCheckoutSessionStore";

export interface CheckoutExchangeTabsProps {
  activePane: ExchangePane;
  onSelectPane: (pane: ExchangePane) => void;
}

/**
 * "Trả hàng" / "Mua thêm" — only for quick-exchange checkout mode.
 */
export function CheckoutExchangeTabs({
  activePane,
  onSelectPane,
}: CheckoutExchangeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Đổi trả nhanh"
      className="flex w-full shrink-0 gap-0 border-b border-gray-200 bg-white"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activePane === ExchangePane.RETURN}
        className={cn(
          "relative flex min-w-0 flex-1 items-center justify-center py-3 text-[14px] font-medium transition-colors",
          activePane === ExchangePane.RETURN
            ? "bg-orange-50/90 text-orange-600"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
        )}
        onClick={() => onSelectPane(ExchangePane.RETURN)}
      >
        Trả hàng
        {activePane === ExchangePane.RETURN ? (
          <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-orange-600" />
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activePane === ExchangePane.PURCHASE}
        className={cn(
          "relative flex min-w-0 flex-1 items-center justify-center py-3 text-[14px] font-medium transition-colors",
          activePane === ExchangePane.PURCHASE
            ? "bg-emerald-50/90 text-emerald-800"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
        )}
        onClick={() => onSelectPane(ExchangePane.PURCHASE)}
      >
        Mua thêm
        {activePane === ExchangePane.PURCHASE ? (
          <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-600" />
        ) : null}
      </button>
    </div>
  );
}
