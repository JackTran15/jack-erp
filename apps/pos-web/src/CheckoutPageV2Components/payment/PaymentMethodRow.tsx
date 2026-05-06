import { forwardRef, useId } from "react";
import { cn } from "@erp/ui";
import {
  ChevronDownIcon,
  CloseIcon,
  PlusCircleIcon,
} from "../icons/Icon";
import type { PaymentMethod, PaymentMethodOption } from "../types";

/**
 * One payment-method line: the user can split a sale across N methods, each
 * line carrying its own selected method + amount.
 */
export interface PaymentLine {
  /** Stable id (UUID) so React keys + remove handlers don't depend on index. */
  id: string;
  method: PaymentMethod;
  amount: number;
}

/**
 * Build a fresh `PaymentLine`. Exposed so hosts can seed initial state
 * without duplicating the shape.
 */
export function createPaymentLine(
  method: PaymentMethod,
  amount = 0,
): PaymentLine {
  return { id: crypto.randomUUID(), method, amount };
}

// ---------------------------------------------------------------------------
// Leaf row — single line, add / remove variants
// ---------------------------------------------------------------------------

export interface PaymentMethodRowProps {
  line: PaymentLine;
  /** All available payment methods (used to render the dropdown). */
  methods: readonly PaymentMethodOption[];
  /**
   * Leading-icon variant. The first line in a list uses `add` (green plus
   * that appends a new row); subsequent lines use `remove` (red × that
   * deletes that row).
   */
  variant: "add" | "remove";
  /** Lock the amount input. */
  amountReadOnly?: boolean;
  /**
   * Methods already chosen by other lines — disabled in this row's dropdown
   * to prevent duplicates. The row's own current method is always enabled.
   */
  unavailableMethods?: ReadonlyArray<PaymentMethod>;

  onChangeMethod: (method: PaymentMethod) => void;
  onChangeAmount: (amount: number) => void;
  /** Triggered by the leading `+` icon — only when `variant="add"`. */
  onAdd?: () => void;
  /** Triggered by the leading `×` icon — only when `variant="remove"`. */
  onRemove?: () => void;
}

/**
 * One payment-method line: leading action icon (+ to add another row, × to
 * remove this row) + native select with chevron + editable amount input.
 *
 * Native `<select>` is used on purpose — it's the cheapest accessible way to
 * render a dropdown that works well on mobile + desktop, and matches the
 * underline-style spec without a heavyweight popover library.
 */
export const PaymentMethodRow = forwardRef<
  HTMLInputElement,
  PaymentMethodRowProps
>(function PaymentMethodRow(
  {
    line,
    methods,
    variant,
    amountReadOnly,
    unavailableMethods,
    onChangeMethod,
    onChangeAmount,
    onAdd,
    onRemove,
  },
  amountInputRef,
) {
  const selectId = useId();
  const isAdd = variant === "add";
  const unavailable = new Set(unavailableMethods ?? []);

  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-2">
      <button
        type="button"
        onClick={isAdd ? onAdd : onRemove}
        aria-label={
          isAdd ? "Thêm phương thức thanh toán" : "Xóa phương thức thanh toán"
        }
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          isAdd
            ? "text-[#22C55E] hover:bg-[#DCFCE7]"
            : "text-[#EF4444] hover:bg-[#FEE2E2]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        )}
      >
        {isAdd ? <PlusCircleIcon size={18} /> : <CloseIcon size={16} />}
      </button>

      <div className="relative min-w-0">
        <select
          id={selectId}
          value={line.method}
          onChange={(e) => onChangeMethod(e.target.value as PaymentMethod)}
          aria-label="Phương thức thanh toán"
          className={cn(
            "h-8 w-full appearance-none truncate bg-transparent pr-6 text-[14px] font-medium text-[#0F172A]",
            "border-b border-[#E2E8F0] focus:border-[#6366F1] focus:outline-none",
          )}
        >
          {methods.map((m) => (
            <option
              key={m.value}
              value={m.value}
              disabled={m.value !== line.method && unavailable.has(m.value)}
            >
              {m.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#64748B]"
        >
          <ChevronDownIcon size={14} />
        </span>
      </div>

      <input
        ref={amountInputRef}
        type="text"
        inputMode="numeric"
        value={line.amount === 0 ? "" : String(line.amount)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChangeAmount(digits === "" ? 0 : Number(digits));
        }}
        readOnly={amountReadOnly}
        aria-label={`Số tiền ${line.method}`}
        placeholder="0"
        className={cn(
          "h-8 w-full bg-transparent px-1 text-right text-[16px] font-semibold text-[#0F172A]",
          "border-b border-[#E2E8F0] focus:border-[#6366F1] focus:outline-none",
          amountReadOnly && "cursor-default",
        )}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// List orchestrator — owns the array, drives add/remove behavior
// ---------------------------------------------------------------------------

export interface PaymentMethodListProps {
  lines: PaymentLine[];
  methods: readonly PaymentMethodOption[];
  /** Single source of truth — host owns the array. */
  onChange: (lines: PaymentLine[]) => void;
  /**
   * Optional read-only predicate per line. Called with the line + index;
   * return `true` to lock the amount input. Defaults to all editable.
   */
  amountReadOnly?: (line: PaymentLine, index: number) => boolean;
  /** Forwarded ref to the FIRST row's amount input (for F-key focus, etc.). */
  amountInputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Stack of `PaymentMethodRow`s. The first row's leading icon adds a new line;
 * subsequent rows show a remove (`×`) button. Methods already in use are
 * disabled inside other rows' dropdowns, so users can't pick the same one
 * twice. When the available methods are exhausted the add button is hidden.
 */
export function PaymentMethodList({
  lines,
  methods,
  onChange,
  amountReadOnly,
  amountInputRef,
}: PaymentMethodListProps) {
  const used = new Set(lines.map((l) => l.method));

  const handleChangeMethod = (id: string, next: PaymentMethod) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, method: next } : l)));
  };
  const handleChangeAmount = (id: string, next: number) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, amount: next } : l)));
  };
  const handleAdd = () => {
    const free = methods.find((m) => !used.has(m.value));
    if (!free) return;
    onChange([...lines, createPaymentLine(free.value)]);
  };
  const handleRemove = (id: string) => {
    if (lines.length <= 1) return;
    onChange(lines.filter((l) => l.id !== id));
  };

  return (
    <div className="flex flex-col">
      {lines.map((line, idx) => (
        <PaymentMethodRow
          key={line.id}
          ref={idx === 0 ? amountInputRef : undefined}
          line={line}
          methods={methods}
          variant={idx === 0 ? "add" : "remove"}
          unavailableMethods={Array.from(used)}
          amountReadOnly={amountReadOnly?.(line, idx)}
          onChangeMethod={(m) => handleChangeMethod(line.id, m)}
          onChangeAmount={(amt) => handleChangeAmount(line.id, amt)}
          onAdd={
            idx === 0 && used.size < methods.length ? handleAdd : undefined
          }
          onRemove={idx > 0 ? () => handleRemove(line.id) : undefined}
        />
      ))}
    </div>
  );
}
