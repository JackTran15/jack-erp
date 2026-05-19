import { forwardRef } from "react";
import { cn } from "@erp/ui";
import { CloseIcon, PlusCircleIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import type { AccountRow } from "@erp/pos/dtos/account.dto";
import type { PaymentMethod } from "@erp/pos/lib/page-libs/checkout/checkout.types";

/**
 * One payment-method line: the user can split a sale across N methods, each
 * line carrying its own selected method + amount.
 *
 * `cashAccountId` (UUID) là COA account.id của tài khoản tiền (CASH 111x /
 * BANK 112x) — dùng trực tiếp làm `payments[].accountId` khi submit checkout
 * (không cần lookup thêm). `method` giữ lại cho receipt display + legacy
 * code (draft snapshot, primary method label).
 */
export interface PaymentLine {
  /** Stable id (UUID) so React keys + remove handlers don't depend on index. */
  id: string;
  method: PaymentMethod;
  /** COA account.id (CASH 111x / BANK 112x) — null khi chưa có dữ liệu API. */
  cashAccountId: string | null;
  amount: number;
}

/**
 * Build a fresh `PaymentLine`. Exposed so hosts can seed initial state
 * without duplicating the shape.
 */
export function createPaymentLine(
  method: PaymentMethod,
  amount = 0,
  cashAccountId: string | null = null,
): PaymentLine {
  return { id: crypto.randomUUID(), method, cashAccountId, amount };
}

// ---------------------------------------------------------------------------
// Leaf row — single line, add / remove variants
// ---------------------------------------------------------------------------

export interface PosPaymentMethodRowProps {
  line: PaymentLine;
  accounts: readonly AccountRow[];
  variant: "add" | "remove";
  amountReadOnly?: boolean;
  unavailableAccountIds?: ReadonlyArray<string>;
  onChangeAccount: (account: AccountRow) => void;
  onChangeAmount: (amount: number) => void;
  onAdd?: () => void;
  onRemove?: () => void;
}

/**
 * One payment-method line: leading action icon (+ to add another row, × to
 * remove this row) + select (cash accounts) + editable amount input.
 */
export const PosPaymentMethodRow = forwardRef<
  HTMLInputElement,
  PosPaymentMethodRowProps
>(function PosPaymentMethodRow(
  {
    line,
    accounts,
    variant,
    amountReadOnly,
    unavailableAccountIds,
    onChangeAccount,
    onChangeAmount,
    onAdd,
    onRemove,
  },
  amountInputRef,
) {
  const isAdd = variant === "add";
  const unavailable = new Set(unavailableAccountIds ?? []);
  const selected =
    accounts.find((a) => a.id === line.cashAccountId) ?? null;

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

      <div className="min-w-0">
        <PosSelect
          value={selected}
          onChange={(item) => onChangeAccount(item)}
          ariaLabel="Phương thức thanh toán"
          variant="underline"
          items={accounts}
          itemKey={(a) => a.id}
          renderItem={(a) => a.name}
          isItemDisabled={(a) =>
            a.id !== line.cashAccountId && unavailable.has(a.id)
          }
          placeholder={
            accounts.length === 0 ? "Chưa có tài khoản" : "Chọn tài khoản"
          }
          className="w-full"
          menuClassName="w-[280px]"
        />
      </div>

      <PosNumberInput
        ref={amountInputRef}
        inputMode="numeric"
        variant="underline"
        value={line.amount}
        onChange={onChangeAmount}
        readOnly={amountReadOnly}
        ariaLabel={`Số tiền ${selected?.name ?? line.method}`}
        placeholder="0"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// List orchestrator — owns the array, drives add/remove behavior
// ---------------------------------------------------------------------------

export interface PosPaymentMethodListProps {
  lines: PaymentLine[];
  accounts: readonly AccountRow[];
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
 * Stack of `PosPaymentMethodRow`s. The first row's leading icon adds a new line;
 * subsequent rows show a remove (`×`) button. Cash accounts đã chọn ở dòng khác
 * sẽ bị disable để tránh trùng. Khi hết tài khoản khả dụng, nút add ẩn đi.
 */
export function PosPaymentMethodList({
  lines,
  accounts,
  onChange,
  amountReadOnly,
  amountInputRef,
}: PosPaymentMethodListProps) {
  const used = new Set(
    lines.map((l) => l.cashAccountId).filter((id): id is string => Boolean(id)),
  );

  const handleChangeAccount = (id: string, next: AccountRow) => {
    onChange(
      lines.map((l) =>
        l.id === id ? { ...l, cashAccountId: next.id } : l,
      ),
    );
  };
  const handleChangeAmount = (id: string, next: number) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, amount: next } : l)));
  };
  const handleAdd = () => {
    const free = accounts.find((a) => !used.has(a.id));
    if (!free) return;
    const seedMethod = lines[0]?.method;
    if (!seedMethod) return;
    onChange([...lines, createPaymentLine(seedMethod, 0, free.id)]);
  };
  const handleRemove = (id: string) => {
    if (lines.length <= 1) return;
    onChange(lines.filter((l) => l.id !== id));
  };

  return (
    <div className="flex flex-col">
      {lines.map((line, idx) => (
        <PosPaymentMethodRow
          key={line.id}
          ref={idx === 0 ? amountInputRef : undefined}
          line={line}
          accounts={accounts}
          variant={idx === 0 ? "add" : "remove"}
          unavailableAccountIds={Array.from(used)}
          amountReadOnly={amountReadOnly?.(line, idx)}
          onChangeAccount={(a) => handleChangeAccount(line.id, a)}
          onChangeAmount={(amt) => handleChangeAmount(line.id, amt)}
          onAdd={
            idx === 0 && used.size < accounts.length ? handleAdd : undefined
          }
          onRemove={idx > 0 ? () => handleRemove(line.id) : undefined}
        />
      ))}
    </div>
  );
}
