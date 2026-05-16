import type { ReactNode } from "react";
import type { SearchSuggestion } from "@erp/pos/components/page-components/Checkout/Common/SearchPopover/SearchPopover";
import { CustomerInputRow } from "@erp/pos/components/page-components/Checkout/Payment/CustomerInputRow/CustomerInputRow";
import type { CustomerActionItem } from "@erp/pos/components/page-components/Checkout/Payment/CustomerActions/CustomerActions";
import { PaymentSubTopBar } from "@erp/pos/components/page-components/Checkout/Payment/PaymentSubTopBar/PaymentSubTopBar";
import { SelectedCustomerCard } from "@erp/pos/components/page-components/Checkout/Payment/SelectedCustomerCard/SelectedCustomerCard";

interface CustomerSectionProps<TCustomer> {
  datetime: string;
  saleMode: string;
  onPickSaleMode?: () => void;
  hasCustomer: boolean;
  selectedCustomerLabel?: string | null;
  customerDebt?: number | null;
  onClearCustomer?: () => void;
  customerActions: CustomerActionItem[];
  onOpenCustomerDetail: () => void;
  customerInputRef: React.Ref<HTMLInputElement>;
  customerQuery: string;
  onCustomerQueryChange: (q: string) => void;
  customerSearch: (q: string) => Promise<SearchSuggestion<TCustomer>[]>;
  onSelectCustomer: (c: TCustomer) => void;
  customerItemKey: (c: TCustomer) => string;
  customerRenderItem: (c: TCustomer) => ReactNode;
  customerRenderMeta?: (c: TCustomer) => ReactNode;
  onSubmitCustomerQuery?: (q: string) => boolean | void;
  onAddCustomer: () => void;
  customerFieldError?: string;
}

export function CustomerSection<TCustomer>({
  datetime,
  saleMode,
  onPickSaleMode,
  hasCustomer,
  selectedCustomerLabel,
  customerDebt,
  onClearCustomer,
  customerActions,
  onOpenCustomerDetail,
  customerInputRef,
  customerQuery,
  onCustomerQueryChange,
  customerSearch,
  onSelectCustomer,
  customerItemKey,
  customerRenderItem,
  customerRenderMeta,
  onSubmitCustomerQuery,
  onAddCustomer,
  customerFieldError,
}: CustomerSectionProps<TCustomer>) {
  return (
    <>
      <div className="px-4">
        <PaymentSubTopBar
          datetime={datetime}
          saleMode={saleMode}
          onPickSaleMode={onPickSaleMode}
        />
      </div>
      <div className="relative px-4 py-2">
        {hasCustomer ? (
          <SelectedCustomerCard
            name={selectedCustomerLabel ?? ""}
            debt={customerDebt}
            onClear={onClearCustomer ?? (() => {})}
            actions={customerActions}
            onClick={onOpenCustomerDetail}
          />
        ) : (
          <CustomerInputRow<TCustomer>
            ref={customerInputRef}
            value={customerQuery}
            onChange={onCustomerQueryChange}
            search={customerSearch}
            onSelect={onSelectCustomer}
            itemKey={customerItemKey}
            renderItem={customerRenderItem}
            renderMeta={customerRenderMeta}
            onSubmitQuery={onSubmitCustomerQuery}
            actions={customerActions}
            emptyAction={{ label: "Tạo khách mới", onClick: onAddCustomer }}
          />
        )}
        {customerFieldError ? (
          <p className="mt-1 text-[12px] text-red-600" role="alert">
            {customerFieldError}
          </p>
        ) : null}
      </div>
    </>
  );
}
