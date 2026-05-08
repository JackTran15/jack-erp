import { cn } from "@erp/ui";

interface PaginationButtonProps {
  ariaLabel: string;
  children: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function PaginationButton({
  ariaLabel,
  children,
  onClick,
  disabled,
}: PaginationButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-gray-200 px-2 text-[14px] text-gray-500 transition-colors",
        "hover:bg-gray-50",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}
