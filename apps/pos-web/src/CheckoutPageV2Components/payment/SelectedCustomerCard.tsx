import { CloseIcon, UserIcon } from "../icons/Icon";
import { formatVnd } from "@erp/ui";
import { CustomerActions, type CustomerActionItem } from "./CustomerActions";

export interface SelectedCustomerCardProps {
  /** Customer display name. */
  name: string;
  /** Outstanding debt — when null/undefined the row is hidden. */
  debt?: number | null;
  /** Required: clear the selection and return to search mode. */
  onClear: () => void;
  /**
   * Same actions that the search row shows — keeps the QR / voucher / future
   * buttons visible after a customer has been selected. Empty array hides them.
   */
  actions?: CustomerActionItem[];
}

/**
 * Compact "selected customer" chip rendered inside the customer field area
 * after a customer is picked. Mirrors State 3 in PaymentSummaryPanel_update.md
 * — avatar + name (bold) + "Dư nợ: …" sub-line + action group + clear button.
 */
export function SelectedCustomerCard({
  name,
  debt,
  onClear,
  actions = [],
}: SelectedCustomerCardProps) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-300 text-indigo-400"
      >
        <UserIcon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-gray-900">
          {name}
        </div>
        {typeof debt === "number" ? (
          <div className="truncate text-[12px] text-gray-500">
            Dư nợ: {formatVnd(debt)}
          </div>
        ) : null}
      </div>
      <CustomerActions actions={actions} />
      <button
        type="button"
        onClick={onClear}
        aria-label={`Xóa khách ${name}`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-50"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
