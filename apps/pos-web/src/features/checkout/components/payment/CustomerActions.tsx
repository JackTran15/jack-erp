import type { ReactNode, RefObject } from "react";
import { IconButton } from "../common/IconButton";

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
 * Designed for extension — adding a future "đổi điểm", "tích điểm", or
 * "tặng quà" button is a one-line append to the consumer's array. To make
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
   * Ref forward xuống nút chính — dùng cho focus management (vd: trả focus
   * về trigger sau khi đóng modal mở từ button này). Ignored cho split-button
   * secondary slot.
   */
  triggerRef?: RefObject<HTMLButtonElement | null>;
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
      {actions.map((a) =>
        a.secondary ? (
          <div
            key={a.key}
            className="relative inline-flex items-center rounded-md"
          >
            <IconButton
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
            <IconButton
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
          <IconButton
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
