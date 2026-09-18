import { cn } from "@erp/ui";
import { Settings } from "lucide-react";

interface Props {
  onClick: () => void;
  className?: string;
}

/** Nút ⚙ mở modal "Tùy chọn" của widget. Bánh răng dạng đặc (filled) theo spec. */
export function SettingsIconButton({ onClick, className }: Props) {
  return (
    <button
      type="button"
      aria-label="Tùy chọn"
      title="Tùy chọn"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
        "text-[#616161] hover:bg-[#F5F5F5] hover:text-[#212121]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2B2E6E]/40",
        className,
      )}
    >
      <Settings className="h-[18px] w-[18px]" fill="currentColor" strokeWidth={1.5} />
    </button>
  );
}
