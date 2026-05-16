import { CloseIcon, UserIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { formatVnd } from "@erp/ui";
import { PosCustomerActions, type CustomerActionItem } from "@erp/pos/components/common/PosCustomerActions/PosCustomerActions";

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
  /**
   * When provided, the avatar+name area becomes clickable (e.g. to open the
   * customer detail dialog). The action group and clear button stay
   * independent of this click target.
   */
  onClick?: () => void;
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
  onClick,
}: SelectedCustomerCardProps) {
  const hasClick = typeof onClick === "function";
  const Tag: "button" | "div" = hasClick ? "button" : "div";

  return (
    <div className="flex h-12 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
      <Tag
        type={hasClick ? "button" : undefined}
        onClick={onClick}
        aria-label={hasClick ? `Xem chi tiết khách ${name}` : undefined}
        className={
          "flex min-w-0 flex-1 items-center gap-2 text-left " +
          (hasClick
            ? "rounded-md outline-none transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            : "")
        }
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
      </Tag>
      <PosCustomerActions actions={actions} />
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
