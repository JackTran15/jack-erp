import { useEffect, useRef, type KeyboardEvent } from "react";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosQuantityInput } from "@erp/pos/components/common/PosQuantityInput/PosQuantityInput";
import {
  lineExceedsOnHandSnapshot,
  lineTotal,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { cn, formatVnd } from "@erp/ui";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import { InvoiceLineItemWarningCell } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/InvoiceLineItemTable/InvoiceLineItemRow/InvoiceLineItemWarningCell/InvoiceLineItemWarningCell";
import { useCheckoutCartActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-cart-actions";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface InvoiceLineItemRowProps {
  index: number;
  line: CartLine;
  /** Dòng hàng trả → nền hồng + SL hiển thị âm. */
  isReturnLine: boolean;
  /** Khóa sửa SL/giá + ẩn nút xóa (dòng trả của hóa đơn trả `invoice_return`). */
  locked: boolean;
}

/**
 * Single editable row inside the invoice line item table. `isReturnLine`/`locked`
 * do bảng tính sẵn theo variant + cart của dòng. Khi `locked`: SL/đơn giá
 * read-only, không có nút xóa (hàng trả theo hóa đơn không được sửa).
 */
export function InvoiceLineItemRow({
  index,
  line,
  isReturnLine,
  locked,
}: InvoiceLineItemRowProps) {
  const {
    isLineSelected,
    selectLine,
    isLineWarning,
    updateQty,
    bumpQty,
    updateUnitPrice,
    removeLine,
  } = useCheckoutSessionCart();
  const { commitQty, consumeQtyAutoFocus } = useCheckoutCartActions();
  const pendingQtyFocusLineId = usePosCheckoutUiStore(
    (s) => s.pendingQtyFocusLineId,
  );

  const selected = isLineSelected(line);
  const hasWarning = isLineWarning(line);
  const autoFocusQty = pendingQtyFocusLineId === line.lineId;

  const rowTotal = lineTotal(line);
  const isReturnQuantityUi = isReturnLine;
  const displayQty = isReturnQuantityUi ? -line.qty : line.qty;
  const oversell = !isReturnQuantityUi && lineExceedsOnHandSnapshot(line);

  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusQty) return;
    const el = qtyInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    consumeQtyAutoFocus();
  }, [autoFocusQty, consumeQtyAutoFocus]);

  const handleQtyKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      qtyInputRef.current?.blur();
      commitQty();
    }
  };

  return (
    <tr
      onClick={() => selectLine(line)}
      className={cn(
        "h-12 cursor-pointer text-sm text-gray-900 transition-colors",
        isReturnQuantityUi
          ? selected
            ? "bg-[#f7d9dd]"
            : "bg-[#fcf1f2] hover:bg-[#f8e4e6]"
          : selected
            ? "bg-indigo-50"
            : oversell
              ? "bg-red-50 hover:bg-red-100/60"
              : "bg-white hover:bg-gray-50",
      )}
    >
      <td className="w-10 px-3 text-center text-gray-500">{index}</td>
      <td className="w-[140px] px-2 text-[13px] font-medium text-gray-700">
        {line.code}
      </td>
      <td className="px-2">{line.name}</td>
      <td className="w-6 px-1">
        <InvoiceLineItemWarningCell
          hasWarning={hasWarning}
          oversell={oversell}
          onHandQty={line.maxQty}
        />
      </td>
      <td className="w-24 px-2">
        <PosQuantityInput
          inputRef={qtyInputRef}
          onKeyDown={handleQtyKeyDown}
          displayValue={displayQty}
          onChangeRaw={(raw) => updateQty(line.lineId, raw)}
          onBumpDown={locked ? undefined : () => bumpQty(line.lineId, -1)}
          onBumpUp={locked ? undefined : () => bumpQty(line.lineId, 1)}
          bumpDownDisabled={line.qty <= 1}
          bumpUpDisabled={isReturnQuantityUi ? line.qty >= line.maxQty : false}
          disabled={locked}
          min={isReturnQuantityUi ? -Math.max(line.maxQty, 1) : 1}
          max={isReturnQuantityUi ? -1 : undefined}
          itemLabel={line.name}
          ariaLabel={`Số lượng ${line.name}`}
          variant="underline"
        />
      </td>
      <td className="w-16 px-2 text-gray-700">{line.unit}</td>
      <td className="w-32 px-2">
        <PosNumberInput
          step={1000}
          value={line.unitPrice || 0}
          onChange={(v) => updateUnitPrice(line.lineId, v.toString())}
          ariaLabel={`Đơn giá ${line.name}`}
          variant="underline"
          className="w-full"
          readOnly={locked}
        />
      </td>
      <td className="w-28 px-2 text-right font-medium">
        {formatVnd(rowTotal)}
      </td>
      <td className="w-10 px-2 text-right">
        {locked ? null : (
          <button
            type="button"
            aria-label={`Xóa ${line.name}`}
            onClick={(e) => {
              e.stopPropagation();
              removeLine(line.lineId);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <CloseIcon size={16} />
          </button>
        )}
      </td>
    </tr>
  );
}
