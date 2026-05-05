import { CloseIcon, WarningDot } from "../icons/Icon";
import { cn } from "@erp/ui";
import type { InvoiceLineItem } from "../types";
import { formatVnd } from "@erp/ui";

export interface InvoiceLineItemRowProps {
  index: number;
  line: InvoiceLineItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onChangeQty: (id: string, qty: number) => void;
}

/** Single editable row inside the invoice line item table. */
export function InvoiceLineItemRow({
  index,
  line,
  selected,
  onSelect,
  onRemove,
  onChangeQty,
}: InvoiceLineItemRowProps) {
  const lineTotal = line.qty * line.unitPrice;
  return (
    <tr
      onClick={() => onSelect(line.id)}
      className={cn(
        "h-12 cursor-pointer text-[14px] text-gray-900 transition-colors",
        selected ? "bg-indigo-50" : "bg-white hover:bg-gray-50",
      )}
    >
      <td className="w-10 px-3 text-center text-gray-500">{index}</td>
      <td className="w-[140px] px-2 text-[13px] font-medium text-gray-700">
        {line.sku}
      </td>
      <td className="px-2">{line.name}</td>
      <td className="w-6 px-1">
        {line.hasWarning ? (
          <span
            role="img"
            aria-label="Cảnh báo tồn kho"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-red-500"
          >
            <WarningDot size={8} />
          </span>
        ) : null}
      </td>
      <td className="w-16 px-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={line.qty}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n > 0) onChangeQty(line.id, n);
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Số lượng ${line.name}`}
          className="h-8 w-14 rounded-md border border-gray-200 bg-white px-2 text-center text-[14px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </td>
      <td className="w-16 px-2 text-gray-700">{line.unit}</td>
      <td className="w-28 px-2 text-right">{formatVnd(line.unitPrice)}</td>
      <td className="w-28 px-2 text-right font-medium">
        {formatVnd(lineTotal)}
      </td>
      <td className="w-10 px-2 text-right">
        <button
          type="button"
          aria-label={`Xóa ${line.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(line.id);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <CloseIcon size={16} />
        </button>
      </td>
    </tr>
  );
}
