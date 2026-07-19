import { forwardRef } from "react";
import { cn } from "@erp/ui";
import { CloseIcon, PlusCircleIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import type { PaymentAccountRow } from "@erp/pos/interfaces/account.interface";
import type { PaymentMethodOption } from "@erp/pos/interfaces/checkout.interface";
import {
  API_METHOD_TO_PAYMENT_METHOD,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@erp/pos/constants/checkout.constant";

/**
 * One payment-method line: the user can split a sale across N methods, each
 * line carrying its own selected account + amount.
 *
 * `paymentAccountId` (UUID) là id của tài khoản nhận tiền đã cấu hình
 * (`payment_accounts` ở BE) — gửi trực tiếp làm `payments[].paymentAccountId` khi
 * checkout; BE tự suy ra COA account. `method` được suy từ account đã chọn, giữ
 * lại cho receipt display + primary method label.
 */
export interface PaymentLine {
  /** Stable id (UUID) so React keys + remove handlers don't depend on index. */
  id: string;
  method: PaymentMethod;
  /** payment_accounts.id của tài khoản nhận tiền — null khi chưa chọn. */
  paymentAccountId: string | null;
  amount: number;
}

/**
 * Build a fresh `PaymentLine`. Exposed so hosts can seed initial state
 * without duplicating the shape.
 */
export function createPaymentLine(
  method: PaymentMethod,
  amount = 0,
  paymentAccountId: string | null = null,
): PaymentLine {
  return { id: crypto.randomUUID(), method, paymentAccountId, amount };
}

/**
 * Nhãn hiển thị cho một tài khoản nhận tiền trong dropdown, dạng
 * "Lam Hoàng An - 199118899" (tên quỹ tiền gửi + số tài khoản). Phương thức đã
 * được chọn ở select phía trên nên nhãn ở đây KHÔNG lặp lại phương thức —
 * `label` (free-text admin nhập, thường chỉ ghi "Chuyển khoản") chỉ dùng khi
 * mapping chưa liên kết quỹ nào.
 */
export function formatPaymentAccountLabel(account: PaymentAccountRow): string {
  const depositParts = [account.depositAccountName, account.accountNumber]
    .filter((p): p is string => Boolean(p))
    .join(" - ");
  if (depositParts) return depositParts;
  if (account.label) return account.label;
  const bankParts = [account.accountNumber, account.bankCode, account.bankName]
    .filter((p): p is string => Boolean(p))
    .join(" - ");
  if (bankParts) return bankParts;
  return account.paymentMethod === "cash" ? "Tiền mặt" : account.paymentMethod;
}

/** Ngân hàng + chi nhánh, hiển thị dòng phụ dưới nhãn trong menu chọn tài khoản. */
function formatPaymentAccountMeta(account: PaymentAccountRow): string | null {
  const parts = [account.bankName, account.bankCode].filter((p): p is string =>
    Boolean(p),
  );
  return parts.length ? parts.join(" - ") : null;
}

/** Các tài khoản đã cấu hình cho một phương thức. */
function accountsOfMethod(
  accounts: readonly PaymentAccountRow[],
  method: PaymentMethod,
): PaymentAccountRow[] {
  return accounts.filter(
    (a) => API_METHOD_TO_PAYMENT_METHOD[a.paymentMethod] === method,
  );
}

/** Chỉ hiện phương thức thực sự có tài khoản đã cấu hình ở chi nhánh này. */
function availableMethods(
  accounts: readonly PaymentAccountRow[],
): PaymentMethodOption[] {
  const present = new Set(
    accounts.map((a) => API_METHOD_TO_PAYMENT_METHOD[a.paymentMethod]),
  );
  return PAYMENT_METHODS.filter((m) => present.has(m.value));
}

// ---------------------------------------------------------------------------
// Leaf row — single line, add / remove variants
// ---------------------------------------------------------------------------

export interface PosPaymentMethodRowProps {
  line: PaymentLine;
  accounts: readonly PaymentAccountRow[];
  variant: "add" | "remove";
  amountReadOnly?: boolean;
  unavailableAccountIds?: ReadonlyArray<string>;
  onChangeMethod: (method: PaymentMethod) => void;
  onChangeAccount: (account: PaymentAccountRow) => void;
  onChangeAmount: (amount: number) => void;
  onAdd?: () => void;
  onRemove?: () => void;
}

/**
 * One payment-method line: leading action icon (+ to add another row, × to
 * remove this row) + phương thức + số tiền trên một hàng, và select tài khoản
 * nhận tiền ở hàng dưới (lọc theo phương thức đang chọn).
 *
 * Select tài khoản chỉ hiện khi phương thức đó có quỹ tiền gửi để chọn — tiền
 * mặt không gắn quỹ nên select thứ hai sẽ chỉ lặp lại nhãn phương thức.
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
    onChangeMethod,
    onChangeAccount,
    onChangeAmount,
    onAdd,
    onRemove,
  },
  amountInputRef,
) {
  const isAdd = variant === "add";
  const unavailable = new Set(unavailableAccountIds ?? []);
  const methodOptions = availableMethods(accounts);
  const methodAccounts = accountsOfMethod(accounts, line.method);
  const selectedMethod =
    methodOptions.find((m) => m.value === line.method) ?? null;
  const selectedAccount =
    methodAccounts.find((a) => a.id === line.paymentAccountId) ?? null;
  const showAccountSelect = methodAccounts.some(
    (a) => a.depositAccountName || a.accountNumber,
  );

  return (
    <div className="py-2">
      <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
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
            value={selectedMethod}
            onChange={(item) => onChangeMethod(item.value)}
            ariaLabel="Phương thức thanh toán"
            variant="underline"
            items={methodOptions}
            itemKey={(m) => m.value}
            renderItem={(m) => m.label}
            isItemDisabled={(m) => {
              if (m.value === line.method) return false;
              const opts = accountsOfMethod(accounts, m.value);
              return (
                opts.length > 0 && opts.every((a) => unavailable.has(a.id))
              );
            }}
            placeholder={
              methodOptions.length === 0
                ? "Chưa có tài khoản"
                : "Chọn phương thức"
            }
            className="w-full"
            menuClassName="w-[240px]"
          />
        </div>

        <PosNumberInput
          ref={amountInputRef}
          inputMode="numeric"
          variant="underline"
          value={line.amount}
          onChange={onChangeAmount}
          readOnly={amountReadOnly}
          ariaLabel={`Số tiền ${selectedMethod?.label ?? line.method}`}
          placeholder="0"
        />
      </div>

      {showAccountSelect ? (
        <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 pt-1">
          <span aria-hidden="true" />
          <PosSelect
            value={selectedAccount}
            onChange={(item) => onChangeAccount(item)}
            ariaLabel="Tài khoản nhận tiền"
            variant="underline"
            items={methodAccounts}
            itemKey={(a) => a.id}
            renderItem={(a) => formatPaymentAccountLabel(a)}
            renderMeta={(a) => formatPaymentAccountMeta(a)}
            isItemDisabled={(a) =>
              a.id !== line.paymentAccountId && unavailable.has(a.id)
            }
            placeholder="Chọn tài khoản"
            className="w-full"
            menuClassName="w-[280px]"
          />
        </div>
      ) : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// List orchestrator — owns the array, drives add/remove behavior
// ---------------------------------------------------------------------------

export interface PosPaymentMethodListProps {
  lines: PaymentLine[];
  accounts: readonly PaymentAccountRow[];
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
    lines
      .map((l) => l.paymentAccountId)
      .filter((id): id is string => Boolean(id)),
  );

  const handleChangeAccount = (id: string, next: PaymentAccountRow) => {
    onChange(
      lines.map((l) =>
        l.id === id
          ? {
              ...l,
              paymentAccountId: next.id,
              method: API_METHOD_TO_PAYMENT_METHOD[next.paymentMethod],
            }
          : l,
      ),
    );
  };
  /**
   * Đổi phương thức → tự chọn tài khoản đầu tiên còn trống của phương thức đó.
   * Tài khoản cũ thuộc phương thức cũ nên luôn bị thay; nếu phương thức mới hết
   * tài khoản trống thì để null và người dùng tự chọn ở select bên dưới.
   */
  const handleChangeMethod = (id: string, next: PaymentMethod) => {
    onChange(
      lines.map((l) => {
        if (l.id !== id) return l;
        const free = accounts.find(
          (a) =>
            API_METHOD_TO_PAYMENT_METHOD[a.paymentMethod] === next &&
            (a.id === l.paymentAccountId || !used.has(a.id)),
        );
        return { ...l, method: next, paymentAccountId: free?.id ?? null };
      }),
    );
  };
  const handleChangeAmount = (id: string, next: number) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, amount: next } : l)));
  };
  const handleAdd = () => {
    const free = accounts.find((a) => !used.has(a.id));
    if (!free) return;
    onChange([
      ...lines,
      createPaymentLine(
        API_METHOD_TO_PAYMENT_METHOD[free.paymentMethod],
        0,
        free.id,
      ),
    ]);
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
          onChangeMethod={(m) => handleChangeMethod(line.id, m)}
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
