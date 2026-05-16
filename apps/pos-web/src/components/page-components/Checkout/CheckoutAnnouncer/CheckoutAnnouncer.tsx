import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

/**
 * aria-live region cho announcement. Đọc message từ ui store; auto-dismiss
 * sau ~3s (timer quản lý trong store action `setAnnouncement`).
 */
export const CheckoutAnnouncer = () => {
  const message = usePosCheckoutUiStore((s) => s.announcement);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
};
