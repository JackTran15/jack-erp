import { cn } from "@erp/ui";
import { RefreshCw } from "lucide-react";

interface Props {
  onClick: () => void;
  /** Đang refetch → icon quay và khoá nút. */
  loading?: boolean;
  className?: string;
}

/** Nút ⟳ dùng chung cho cả 3 hàng của trang Tổng quan. */
export function RefreshIconButton({ onClick, loading, className }: Props) {
  return (
    <button
      type="button"
      aria-label="Làm mới"
      title="Làm mới"
      disabled={loading}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
        "text-[#616161] hover:bg-[#F5F5F5] hover:text-[#212121]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2B2E6E]/40",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <RefreshCw
        className={cn("h-[18px] w-[18px]", loading && "animate-spin motion-reduce:animate-none")}
        strokeWidth={2}
      />
    </button>
  );
}
