import type { ReactNode, Ref } from "react";
import { ChevronDownIcon } from "@erp/pos/components/icons/Icon";
import { cn } from "@erp/ui";

export interface DropdownButtonProps {
  /** Optional leading content (icon, avatar, etc). */
  leading?: ReactNode;
  /** Main label content. */
  children: ReactNode;
  /** Hint shown after the label, e.g. shortcut. */
  trailingHint?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** Visual size — `md` is the default toolbar height. */
  size?: "sm" | "md";
  /** Forwarded to the underlying button — used by hotkeys to focus the trigger. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Generic "dropdown trigger" button — label + chevron.
 * Used for: NV bán hàng, Bảng giá, Location indicator, "Tại cửa hàng",
 * payment-method picker, category filter, etc.
 */
export function DropdownButton({
  leading,
  children,
  trailingHint,
  onClick,
  className,
  size = "md",
  ref,
}: DropdownButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white text-gray-700 transition-colors",
        "hover:border-gray-300 hover:bg-gray-50",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        size === "md" && "h-9 px-3 text-[13px]",
        size === "sm" && "h-8 px-2 text-[13px]",
        className,
      )}
    >
      {leading}
      <span className="flex-1 text-left whitespace-nowrap">{children}</span>
      {trailingHint}
      <ChevronDownIcon size={14} className="text-gray-400" />
    </button>
  );
}
