import type { ReactNode } from "react";
import { IconButton } from "../common/IconButton";

/**
 * One actionable button shown next to the customer field/chip.
 * The same item is rendered identically whether a customer is selected
 * (`SelectedCustomerCard`) or not (`CustomerInputRow`).
 *
 * Designed for extension — adding a future "đổi điểm", "tích điểm", or
 * "tặng quà" button is a one-line append to the consumer's array.
 */
export interface CustomerActionItem {
  /** Stable key for React reconciliation. */
  key: string;
  /** Visual — usually a 16px lucide-style SVG. */
  icon: ReactNode;
  /** Required for a11y; describes the action to assistive tech. */
  ariaLabel: string;
  onClick?: () => void;
  /** Highlights the button when its associated popover/menu is open. */
  isToggled?: boolean;
  /** Disables interaction without removing the button from the row. */
  disabled?: boolean;
}

export interface CustomerActionsProps {
  actions: CustomerActionItem[];
}

/**
 * Inline group of customer-related quick actions (QR, thêm khách, lịch sử,
 * voucher, …). Pure presentational — every behavior comes from the action
 * items themselves.
 */
export function CustomerActions({ actions }: CustomerActionsProps) {
  if (actions.length === 0) return null;
  return (
    <>
      {actions.map((a) => (
        <IconButton
          key={a.key}
          icon={a.icon}
          ariaLabel={a.ariaLabel}
          onClick={a.onClick}
          disabled={a.disabled}
          active={a.isToggled}
        />
      ))}
    </>
  );
}
