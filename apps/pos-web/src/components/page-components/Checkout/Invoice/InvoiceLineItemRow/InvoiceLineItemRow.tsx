import { useEffect, useRef, type KeyboardEvent } from "react";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosQuantityInput } from "@erp/pos/components/common/PosQuantityInput/PosQuantityInput";
import {
  lineExceedsOnHandSnapshot,
  lineTotal,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { cn, formatVnd } from "@erp/ui";
import type { CartLine } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { InvoiceLineItemWarningCell } from "@erp/pos/components/page-components/Checkout/Invoice/InvoiceLineItemWarningCell/InvoiceLineItemWarningCell";
import { CheckoutPane } from "@erp/pos/stores/common/checkout-session.store";

export interface InvoiceLineItemRowProps {
  index: number;
  line: CartLine;
  selected: boolean;
  checkoutPane?: CheckoutPane;
  /** Show the red warning dot before SL (e.g. line is at stock cap). */
  hasWarning?: boolean;
  /**
   * When `=== line.lineId`, the row automatically focuses and selects the qty
   * input (for the MISA flow: after pressing Enter to add a product, focus
   * moves to the qty field of the newly added line).
   */
  autoFocusQty?: boolean;
  /** Called after the row has consumed the focus event, so the parent can reset pendingFocusLineId. */
  onAutoFocusConsumed?: () => void;
  /**
   * Enter on the qty input triggers this callback — the host uses it to return
   * focus to the product search field, completing one "add product → change qty
   * → search next product" cycle.
   */
  onCommitQty?: () => void;
  onSelect: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onChangeQty: (lineId: string, raw: string) => void;
  onBumpQty?: (lineId: string, delta: number) => void;
  onChangeUnitPrice: (lineId: string, raw: string) => void;
}

/** Single editable row inside the invoice line item table. */
export function InvoiceLineItemRow({
  index,
  line,
  selected,
  checkoutPane = CheckoutPane.PURCHASE,
  hasWarning,
  autoFocusQty,
  onAutoFocusConsumed,
  onCommitQty,
  onSelect,
  onRemove,
  onChangeQty,
  onBumpQty,
  onChangeUnitPrice,
}: InvoiceLineItemRowProps) {
  const rowTotal = lineTotal(line);
  const isReturnQuantityUi =
    Boolean(line.isReturnCredit) || checkoutPane === CheckoutPane.RETURN;
  const displayQty = isReturnQuantityUi ? -line.qty : line.qty;
  const oversell = !isReturnQuantityUi && lineExceedsOnHandSnapshot(line);

  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusQty) return;
    const el = qtyInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    onAutoFocusConsumed?.();
  }, [autoFocusQty, onAutoFocusConsumed]);

  const handleQtyKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      qtyInputRef.current?.blur();
      onCommitQty?.();
    }
  };
  return (
    <tr
      onClick={() => onSelect(line.lineId)}
      className={cn(
        "h-12 cursor-pointer text-sm text-gray-900 transition-colors",
        selected
          ? "bg-indigo-50"
          : isReturnQuantityUi
            ? "bg-orange-50 hover:bg-orange-100/80"
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
          onChangeRaw={(raw) => onChangeQty(line.lineId, raw)}
          onBumpDown={onBumpQty ? () => onBumpQty(line.lineId, -1) : undefined}
          onBumpUp={onBumpQty ? () => onBumpQty(line.lineId, 1) : undefined}
          bumpDownDisabled={line.qty <= 1}
          bumpUpDisabled={
            isReturnQuantityUi ? line.qty >= line.maxQty : false
          }
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
          onChange={(v) => onChangeUnitPrice(line.lineId, v.toString())}
          ariaLabel={`Đơn giá ${line.name}`}
          variant="underline"
          className="w-full"
        />
      </td>
      <td className="w-28 px-2 text-right font-medium">
        {formatVnd(rowTotal)}
      </td>
      <td className="w-10 px-2 text-right">
        <button
          type="button"
          aria-label={`Xóa ${line.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(line.lineId);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <CloseIcon size={16} />
        </button>
      </td>
    </tr>
  );
}
