import { CloseIcon, UserIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { formatVnd } from "@erp/ui";
import {
  PosCustomerActions,
  type CustomerActionItem,
} from "@erp/pos/components/common/PosCustomerActions/PosCustomerActions";
import { useCheckoutCustomer } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-customer";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerApi";

export interface SelectedCustomerCardProps {
  /** Actions group (Voucher / quà tặng nếu đã chọn khách). */
  actions?: CustomerActionItem[];
}

/**
 * Compact "selected customer" chip rendered inside the customer field area
 * after a customer is picked. Đọc customer từ store; click name → mở dialog
 * chi tiết khách (CustomerDetailDialog). Customer debt hiện chưa có data →
 * ẩn (truyền null xuống).
 */
export function SelectedCustomerCard({ actions = [] }: SelectedCustomerCardProps) {
  const { selectedCustomer, handleClearCustomer, handleOpenCustomerDetail } =
    useCheckoutCustomer();

  if (!selectedCustomer) return null;

  const name = formatCustomerDisplay(selectedCustomer);
  const debt: number | null = null;

  return (
    <div className="flex h-12 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
      <button
        type="button"
        onClick={handleOpenCustomerDetail}
        aria-label={`Xem chi tiết khách ${name}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left rounded-md outline-none transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-300 text-indigo-400"
        >
          <UserIcon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-gray-900">
            {name}
          </span>
          {typeof debt === "number" ? (
            <span className="block truncate text-[12px] text-gray-500">
              Dư nợ: {formatVnd(debt)}
            </span>
          ) : null}
        </span>
      </button>
      <PosCustomerActions actions={actions} />
      <button
        type="button"
        onClick={handleClearCustomer}
        aria-label={`Xóa khách ${name}`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-50"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
