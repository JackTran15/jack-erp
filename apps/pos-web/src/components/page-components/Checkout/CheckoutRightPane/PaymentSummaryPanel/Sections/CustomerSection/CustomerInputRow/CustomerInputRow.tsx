import type { RefObject } from "react";
import { UserIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosSearchPopover } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  PosCustomerActions,
  type CustomerActionItem,
} from "@erp/pos/components/common/PosCustomerActions/PosCustomerActions";
import { useCheckoutCustomer } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-customer";
import {
  formatCustomerDisplay,
  type CustomerRow,
} from "@erp/pos/lib/common/customerApi";

export interface CustomerInputRowProps {
  inputRef: RefObject<HTMLInputElement | null>;
  /** Actions hiển thị bên phải input (QR / Add / Voucher group). */
  actions?: CustomerActionItem[];
}

/**
 * Customer search row at the top of the payment panel. Leading user icon.
 * Concrete cho CustomerRow — đọc state + handlers từ customer hook.
 */
export function CustomerInputRow({ inputRef, actions = [] }: CustomerInputRowProps) {
  const {
    customerQuery,
    setCustomerQuery,
    setCustomerFieldError,
    customerSearchAdapter,
    pickCustomer,
    handleCustomerSubmitQuery,
    handleAddCustomer,
  } = useCheckoutCustomer();

  return (
    <PosSearchPopover<CustomerRow>
      inputRef={inputRef}
      value={customerQuery}
      onValueChange={(q) => {
        setCustomerQuery(q);
        setCustomerFieldError("");
      }}
      search={customerSearchAdapter}
      onSelect={(c) => pickCustomer(c)}
      itemKey={(c) => c.id}
      renderItem={(c) => formatCustomerDisplay(c)}
      renderMeta={(c) => (
        <>
          {c.phone ?? "—"}
          {c.email ? ` · ${c.email}` : ""}
        </>
      )}
      onSubmitQuery={handleCustomerSubmitQuery}
      emptyAction={{ label: "Tạo khách mới", onClick: handleAddCustomer }}
      placeholder="(F4) SDT, tên khách hàng"
      minChars={2}
      debounceMs={350}
      containerClassName="flex h-12 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
      inputClassName="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
      prefix={
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-300 text-indigo-400"
        >
          <UserIcon size={16} />
        </span>
      }
      suffix={<PosCustomerActions actions={actions} />}
    />
  );
}
