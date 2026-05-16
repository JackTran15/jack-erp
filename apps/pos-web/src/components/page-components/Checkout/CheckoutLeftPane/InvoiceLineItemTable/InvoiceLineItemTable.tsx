import { TooltipProvider } from "@erp/ui";
import { InvoiceLineItemRow } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/InvoiceLineItemTable/InvoiceLineItemRow/InvoiceLineItemRow";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import {
  selectInvoiceTableCheckoutPane,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

const HEADERS: Array<{ label: string; align?: "left" | "right" | "center" }> = [
  { label: "STT", align: "center" },
  { label: "SKU" },
  { label: "Hàng hóa" },
  { label: "" },
  { label: "SL", align: "center" },
  { label: "ĐVT" },
  { label: "Đơn giá", align: "right" },
  { label: "Thành tiền", align: "right" },
  { label: "" },
];

/**
 * Invoice line items table. Đọc trực tiếp cart/selectedLineId từ session-cart
 * hook. Row component tự consume các handler từ cart-actions hook.
 */
export function InvoiceLineItemTable() {
  const { cart } = useCheckoutSessionCart();
  const checkoutPane = usePosCheckoutSessionStore(
    selectInvoiceTableCheckoutPane,
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-gray-50">
            <tr className="h-10 border-b border-gray-200 text-[13px] font-medium text-gray-500">
              {HEADERS.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className={
                    h.align === "right"
                      ? "px-2 text-right"
                      : h.align === "center"
                        ? "px-2 text-center"
                        : "px-2 text-left"
                  }
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cart.length === 0 ? (
              <tr>
                <td
                  colSpan={HEADERS.length}
                  className="py-12 text-center text-[13px] text-gray-400"
                >
                  Chưa có hàng nào — chọn hàng từ "Tư vấn bán hàng" bên dưới.
                </td>
              </tr>
            ) : (
              cart.map((line, i) => (
                <InvoiceLineItemRow
                  key={line.lineId}
                  index={i + 1}
                  line={line}
                  checkoutPane={checkoutPane}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
