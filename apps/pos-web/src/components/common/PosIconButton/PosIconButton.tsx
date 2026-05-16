import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@erp/ui";

export interface PosIconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The icon node to render (lucide-style component or SVG). */
  icon: ReactNode;
  /** Required for accessibility — describes what the button does. */
  ariaLabel: string;
  /** When true, paints with an active accent color. */
  active?: boolean;
}

/**
 * Square 32×32 icon button with rounded corners. Hover lightens the bg.
 * Reusable for any icon-only action (close tab, scan barcode, refresh, etc).
 */
export const PosIconButton = forwardRef<HTMLButtonElement, PosIconButtonProps>(
  function PosIconButton(
    { icon, ariaLabel, active, className, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors",
          "hover:bg-gray-100 hover:text-gray-700",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
          active && "bg-indigo-50 text-indigo-600",
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    );
  },
);
