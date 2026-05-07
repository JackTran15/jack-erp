import type { ReactNode } from "react";
import { cn } from "@erp/ui";

interface StepperButtonProps {
  ariaLabel: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export function StepperButton({
  ariaLabel,
  icon,
  onClick,
  disabled,
}: StepperButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#D1D5DB] text-[#6B7280] transition-colors",
        "hover:bg-[#F3F4F6] active:bg-[#E5E7EB]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B5BD6] focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {icon}
    </button>
  );
}
