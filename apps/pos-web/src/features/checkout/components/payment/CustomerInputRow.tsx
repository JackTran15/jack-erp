import { forwardRef, type ReactNode } from "react";
import { UserIcon } from "@erp/pos/components/icons/Icon";
import {
  SearchPopover,
  type SearchSuggestion,
} from "../common/SearchPopover";
import { CustomerActions, type CustomerActionItem } from "./CustomerActions";

export interface CustomerInputRowProps<T> {
  value: string;
  onChange: (next: string) => void;

  /** Async customer search. */
  search: (q: string) => Promise<SearchSuggestion<T>[]>;
  /** Called when a customer suggestion is picked. */
  onSelect: (item: T) => void;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  /** Enter pressed without highlight (used to trigger create-or-error flow). */
  onSubmitQuery?: (q: string) => boolean | void;

  /**
   * Action buttons rendered to the right of the input. The same array is
   * used by `SelectedCustomerCard` so the icons remain visible when a
   * customer is selected. Pass an empty array (or omit) to hide.
   */
  actions?: CustomerActionItem[];

  /** Empty-state link inside the popover (e.g. "Tạo khách mới"). */
  emptyAction?: { label: string; onClick: (currentQuery: string) => void };

  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
}

/**
 * Customer search row at the top of the payment panel. Leading user icon,
 * trailing action group rendered via the shared `CustomerActions` component.
 */
export const CustomerInputRow = forwardRef(function CustomerInputRow<T>(
  {
    value,
    onChange,
    search,
    onSelect,
    itemKey,
    renderItem,
    renderMeta,
    onSubmitQuery,
    actions = [],
    emptyAction,
    placeholder = "(F4) SDT, tên khách hàng",
    minChars = 2,
    debounceMs = 350,
  }: CustomerInputRowProps<T>,
  ref: React.Ref<HTMLInputElement>,
) {
  return (
    <SearchPopover<T>
      inputRef={ref}
      value={value}
      onValueChange={onChange}
      search={search}
      onSelect={onSelect}
      itemKey={itemKey}
      renderItem={renderItem}
      renderMeta={renderMeta}
      onSubmitQuery={onSubmitQuery}
      placeholder={placeholder}
      minChars={minChars}
      debounceMs={debounceMs}
      emptyAction={emptyAction}
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
      suffix={<CustomerActions actions={actions} />}
    />
  );
}) as <T>(
  props: CustomerInputRowProps<T> & { ref?: React.Ref<HTMLInputElement> },
) => ReturnType<React.FC>;
