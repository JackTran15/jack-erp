import { CloseIcon, WarningDot } from "../icons/Icon";
import { cn, formatVnd } from "@erp/ui";
import type { CartLine } from "../types";

export interface InvoiceLineItemRowProps {
  index: number;
  line: CartLine;
  selected: boolean;
  /** Show the red warning dot before SL (e.g. line is at stock cap). */
  hasWarning?: boolean;
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
  hasWarning,
  onSelect,
  onRemove,
  onChangeQty,
  onBumpQty,
  onChangeUnitPrice,
}: InvoiceLineItemRowProps) {
  const lineTotal = line.qty * line.unitPrice;
  return (
    <tr
      onClick={() => onSelect(line.lineId)}
      className={cn(
        "h-12 cursor-pointer text-[14px] text-gray-900 transition-colors",
        selected ? "bg-indigo-50" : "bg-white hover:bg-gray-50",
      )}
    >
      <td className="w-10 px-3 text-center text-gray-500">{index}</td>
      <td className="w-[140px] px-2 text-[13px] font-medium text-gray-700">
        {line.code}
      </td>
      <td className="px-2">{line.name}</td>
      <td className="w-6 px-1">
        {hasWarning ? (
          <span
            role="img"
            aria-label="Cảnh báo tồn kho"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-red-500"
          >
            <WarningDot size={8} />
          </span>
        ) : null}
      </td>
      <td className="w-20 px-2">
        <div className="flex items-center gap-0.5">
          {onBumpQty ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBumpQty(line.lineId, -1);
              }}
              disabled={line.qty <= 1}
              aria-label={`Giảm ${line.name}`}
              className="h-7 w-5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            >
              −
            </button>
          ) : null}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={line.maxQty}
            value={line.qty}
            onChange={(e) => onChangeQty(line.lineId, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Số lượng ${line.name}`}
            className="h-7 w-10 rounded-md border border-gray-200 bg-white px-1 text-center text-[14px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {onBumpQty ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBumpQty(line.lineId, 1);
              }}
              disabled={line.qty >= line.maxQty}
              aria-label={`Tăng ${line.name}`}
              className="h-7 w-5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            >
              +
            </button>
          ) : null}
        </div>
      </td>
      <td className="w-16 px-2 text-gray-700">{line.unit}</td>
      <td className="w-32 px-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1000}
          value={line.unitPrice || ""}
          onChange={(e) => onChangeUnitPrice(line.lineId, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Đơn giá ${line.name}`}
          className="h-7 w-full rounded-md border border-transparent bg-transparent px-1 text-right text-[14px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </td>
      <td className="w-28 px-2 text-right font-medium">{formatVnd(lineTotal)}</td>
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
