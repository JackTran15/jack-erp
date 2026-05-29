import { useEffect, useRef, type KeyboardEvent } from "react";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosQuantityInput } from "@erp/pos/components/common/PosQuantityInput/PosQuantityInput";
import {
  lineDiscountAmount,
  lineExceedsOnHandSnapshot,
  lineTotal,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { cn, formatVnd } from "@erp/ui";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import { InlineNoteEditor } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/InvoiceLineItemTable/InvoiceLineItemRow/InlineNoteEditor/InlineNoteEditor";
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

function formatDiscountLine(line: CartLine): string {
  const d = line.lineDiscount;
  if (!d) return "";
  const amount = lineDiscountAmount(line);
  if (d.type === "percent") {
    return `KM ${d.value} % (${formatVnd(amount)}) - ${d.reason}`;
  }
  return `KM ${formatVnd(d.value)} - ${d.reason}`;
}

/**
 * Single editable row inside the invoice line item table. `isReturnLine`/`locked`
 * do bảng tính sẵn theo variant + cart của dòng. Khi `locked`: SL/đơn giá
 * read-only, không có nút xóa (hàng trả theo hóa đơn không được sửa), không mở
 * context menu. Hiển thị KM/note inline khi có; cột Thành tiền chia 2 dòng
 * (giá gốc gạch ngang + giá sau KM) khi có khuyến mại.
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
  const openLineContextMenu = usePosCheckoutUiStore(
    (s) => s.openLineContextMenu,
  );
  const editingNoteLineId = usePosCheckoutUiStore(
    (s) => s.editingNoteLineId,
  );

  const selected = isLineSelected(line);
  const hasWarning = isLineWarning(line);
  const autoFocusQty = pendingQtyFocusLineId === line.lineId;
  const editingNote = editingNoteLineId === line.lineId;

  const rowTotal = lineTotal(line);
  const grossTotal = line.unitPrice * line.qty;
  const isReturnQuantityUi = isReturnLine;
  const displayQty = isReturnQuantityUi ? -line.qty : line.qty;
  const oversell = !isReturnQuantityUi && lineExceedsOnHandSnapshot(line);
  const hasDiscount = Boolean(line.lineDiscount);

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

  const handleContextMenu = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (locked) return;
    e.preventDefault();
    selectLine(line);
    openLineContextMenu(line.lineId, e.clientX, e.clientY);
  };

  return (
    <tr
      onClick={() => selectLine(line)}
      onContextMenu={handleContextMenu}
      className={cn(
        "cursor-pointer align-top text-sm text-gray-900 transition-colors",
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
      <td className="w-10 px-3 py-2 text-center text-gray-500">{index}</td>
      <td className="w-[140px] px-2 py-2 text-[13px] font-medium text-gray-700">
        {line.code}
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-col gap-1">
          <span>{line.name}</span>
          {hasDiscount ? (
            <span className="text-[12px] italic text-[#E5403A]">
              {formatDiscountLine(line)}
            </span>
          ) : null}
          {editingNote ? (
            <InlineNoteEditor lineId={line.lineId} initial={line.note ?? ""} />
          ) : line.note ? (
            <span className="text-[12px] italic text-gray-500">
              Ghi chú:{" "}
              <span className="text-gray-400">{line.note}</span>
            </span>
          ) : null}
        </div>
      </td>
      <td className="w-6 px-1 py-2">
        <InvoiceLineItemWarningCell
          hasWarning={hasWarning}
          oversell={oversell}
          onHandQty={line.maxQty}
        />
      </td>
      <td className="w-24 px-2 py-2">
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
      <td className="w-16 px-2 py-2 text-gray-700">{line.unit}</td>
      <td className="w-32 px-2 py-2">
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
      <td className="w-28 px-2 py-2 text-right font-medium">
        {hasDiscount ? (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[12px] text-gray-500 line-through">
              {formatVnd(isReturnQuantityUi ? -grossTotal : grossTotal)}
            </span>
            <span>{formatVnd(rowTotal)}</span>
          </div>
        ) : (
          formatVnd(rowTotal)
        )}
      </td>
      <td className="w-10 px-2 py-2 text-right">
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
