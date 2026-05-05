import { forwardRef, type ReactNode } from "react";
import {
  GiftIcon,
  PlusCircleIcon,
  QrIcon,
  ReceiptIcon,
  UserIcon,
} from "../icons/Icon";
import { IconButton } from "../common/IconButton";
import {
  SearchPopover,
  type SearchSuggestion,
} from "../common/SearchPopover";

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

  /** Action buttons on the right edge. */
  onAddCustomer?: () => void;
  onScanQr?: () => void;
  onOpenReceipts?: () => void;
  onApplyVoucher?: () => void;

  /** Empty-state link inside the popover (e.g. "Tạo khách mới"). */
  emptyAction?: { label: string; onClick: (currentQuery: string) => void };

  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
}

/**
 * Customer search row at the top of the payment panel. Leading user icon,
 * trailing QR / add / receipt / gift utility actions. Suggestions render
 * via SearchPopover.
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
    onAddCustomer,
    onScanQr,
    onOpenReceipts,
    onApplyVoucher,
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
      containerClassName="flex h-10 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
      inputClassName="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
      prefix={<UserIcon size={16} className="text-gray-500" />}
      suffix={
        <>
          <IconButton
            ariaLabel="Quét QR khách"
            icon={<QrIcon size={16} />}
            onClick={onScanQr}
          />
          <IconButton
            ariaLabel="Thêm khách mới"
            icon={<PlusCircleIcon size={16} className="text-green-500" />}
            onClick={onAddCustomer}
          />
          <IconButton
            ariaLabel="Lịch sử mua hàng"
            icon={<ReceiptIcon size={16} />}
            onClick={onOpenReceipts}
          />
          <IconButton
            ariaLabel="Voucher / quà tặng"
            icon={<GiftIcon size={16} />}
            onClick={onApplyVoucher}
          />
        </>
      }
    />
  );
}) as <T>(
  props: CustomerInputRowProps<T> & { ref?: React.Ref<HTMLInputElement> },
) => ReturnType<React.FC>;
