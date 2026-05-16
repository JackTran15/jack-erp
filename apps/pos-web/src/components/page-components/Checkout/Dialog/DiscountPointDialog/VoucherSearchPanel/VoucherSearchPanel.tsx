import type { FormEvent } from "react";
import { cn } from "@erp/ui";
import { SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { VoucherEmptyState } from "@erp/pos/components/page-components/Checkout/Dialog/DiscountPointDialog/VoucherSearchPanel/VoucherEmptyState/VoucherEmptyState";

interface VoucherSearchPanelProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function VoucherSearchPanel({
  value,
  onChange,
  onSubmit,
}: VoucherSearchPanelProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-6 rounded-lg border border-[#E5E7EB] bg-white p-6",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
      )}
    >
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
          >
            <SearchIcon size={16} strokeWidth={2} />
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Nhập mã ưu đãi"
            aria-label="Nhập mã ưu đãi"
            className={cn(
              "h-11 w-full rounded-lg border border-[#D1D5DB] bg-white pl-10 pr-4 text-[14px] text-[#1F2937]",
              "placeholder:italic placeholder:text-[#9CA3AF]",
              "transition-colors hover:border-[#9CA3AF]",
              "focus:border-[#4F46E5] focus:outline-none focus:ring-[3px] focus:ring-[#4F46E5]/15",
            )}
          />
        </div>
        <button
          type="submit"
          disabled={!value.trim()}
          className={cn(
            "inline-flex h-11 items-center justify-center rounded-lg bg-[#4F46E5] px-5 text-[14px] font-medium text-white",
            "shadow-[0_2px_4px_rgba(79,70,229,0.2)] transition-colors",
            "hover:bg-[#4338CA] active:bg-[#3730A3]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Tìm kiếm
        </button>
      </form>
      <VoucherEmptyState />
      <div aria-hidden="true" className="mt-auto h-1 w-full rounded-full bg-[#E5E7EB]" />
    </section>
  );
}
