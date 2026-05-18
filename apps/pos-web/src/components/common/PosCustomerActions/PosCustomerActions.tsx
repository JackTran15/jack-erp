import type { ReactNode, RefObject } from "react";
import { PosIconButton } from "@erp/pos/components/common/PosIconButton/PosIconButton";

/** Trigger for a split-button's secondary slot — usually a dropdown chevron. */
export interface CustomerActionSecondary {
  icon: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  isToggled?: boolean;
  disabled?: boolean;
}

/**
 * One actionable button shown next to the customer field/chip.
 * The same item is rendered identically whether a customer is selected
 * (`SelectedCustomerCard`) or not (`CustomerInputRow`).
 *
 * Designed for extension — adding a future "redeem points", "accumulate points", or
 * "give gift" button is a one-line append to the consumer's array. To make
 * an entry behave as a split-button, set `secondary` (and optionally
 * `popover` for the menu it anchors).
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
  /**
   * Optional secondary trigger rendered immediately to the right, joined
   * visually as a split-button (e.g. a chevron that opens "more options").
   */
  secondary?: CustomerActionSecondary;
  /**
   * Popover/menu node rendered inside the split-button's relative wrapper
   * (e.g. a `PromoMenu` anchored to the secondary trigger). Ignored when
   * `secondary` is not set.
   */
  popover?: ReactNode;
  /**
   * Ref forwarded to the primary button — used for focus management (e.g.
   * returning focus to the trigger after closing a modal opened from this
   * button). Ignored for the split-button secondary slot.
   */
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export interface PosCustomerActionsProps {
  actions: CustomerActionItem[];
}

/**
 * Inline group of customer-related quick actions (QR, add customer, history,
 * voucher, …). Pure presentational — every behavior comes from the action
 * items themselves.
 */
export function PosCustomerActions({ actions }: PosCustomerActionsProps) {
  if (actions.length === 0) return null;
  return (
    <>
      {actions.map((a) =>
        a.secondary ? (
          <div
            key={a.key}
            className="relative inline-flex items-center rounded-md"
          >
            <PosIconButton
              ref={a.triggerRef}
              icon={a.icon}
              ariaLabel={a.ariaLabel}
              onClick={a.onClick}
              disabled={a.disabled}
              active={a.isToggled}
              className="rounded-r-none"
            />
            <span
              aria-hidden="true"
              className="h-4 w-px bg-gray-200"
            />
            <PosIconButton
              icon={a.secondary.icon}
              ariaLabel={a.secondary.ariaLabel}
              onClick={a.secondary.onClick}
              disabled={a.secondary.disabled}
              active={a.secondary.isToggled}
              className="w-5 rounded-l-none"
            />
            {a.popover}
          </div>
        ) : (
          <PosIconButton
            key={a.key}
            ref={a.triggerRef}
            icon={a.icon}
            ariaLabel={a.ariaLabel}
            onClick={a.onClick}
            disabled={a.disabled}
            active={a.isToggled}
          />
        ),
      )}
    </>
  );
}
