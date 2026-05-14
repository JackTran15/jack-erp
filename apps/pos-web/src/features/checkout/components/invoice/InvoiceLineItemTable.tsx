import type { CartLine } from "../types";
import { TooltipProvider } from "@erp/ui";
import { InvoiceLineItemRow } from "./InvoiceLineItemRow";
import { CheckoutPane } from "@erp/pos/stores/usePosCheckoutSessionStore";

export interface InvoiceLineItemTableProps {
  lines: CartLine[];
  selectedId?: string | null;
  checkoutPane?: CheckoutPane;
  /** Predicate to flag a row with the red warning dot. */
  isLineWarning?: (line: CartLine) => boolean;
  /**
   * When set, the matching row automatically focuses and selects its qty input
   * (for the MISA flow: after pressing Enter to add a product, focus moves to
   * the qty field of the newly added line).
   */
  autoFocusQtyLineId?: string | null;
  /** Called after the row has consumed autoFocusQtyLineId — host should clear the state. */
  onAutoFocusConsumed?: () => void;
  /** Enter on the qty input → host returns focus to the product search field. */
  onCommitQty?: () => void;
  onSelect: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onChangeQty: (lineId: string, raw: string) => void;
  onBumpQty?: (lineId: string, delta: number) => void;
  onChangeUnitPrice: (lineId: string, raw: string) => void;
}

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
 * Invoice line items table. Header is sticky-ish (sticky bg) so the rows
 * scroll under it. Pure presentational — caller owns the data.
 */
export function InvoiceLineItemTable({
  lines,
  selectedId,
  checkoutPane = CheckoutPane.PURCHASE,
  isLineWarning,
  autoFocusQtyLineId,
  onAutoFocusConsumed,
  onCommitQty,
  onSelect,
  onRemove,
  onChangeQty,
  onBumpQty,
  onChangeUnitPrice,
}: InvoiceLineItemTableProps) {
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
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={HEADERS.length}
                  className="py-12 text-center text-[13px] text-gray-400"
                >
                  Chưa có hàng nào — chọn hàng từ "Tư vấn bán hàng" bên dưới.
                </td>
              </tr>
            ) : (
              lines.map((line, i) => (
                <InvoiceLineItemRow
                  key={line.lineId}
                  index={i + 1}
                  line={line}
                  selected={selectedId === line.lineId}
                  hasWarning={isLineWarning?.(line)}
                  autoFocusQty={autoFocusQtyLineId === line.lineId}
                  onAutoFocusConsumed={onAutoFocusConsumed}
                  onCommitQty={onCommitQty}
                  onSelect={onSelect}
                  onRemove={onRemove}
                  onChangeQty={onChangeQty}
                  onBumpQty={onBumpQty}
                  onChangeUnitPrice={onChangeUnitPrice}
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
