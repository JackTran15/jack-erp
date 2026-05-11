import { DateRangeFilter } from "@erp/pos/components/dateRangeFilter";
import type { DateRangeFilterOption } from "@erp/pos/components/dateRangeFilter";
import { cn } from "@erp/ui";
import { SearchIcon } from "@erp/pos/components/icons/Icon";

interface FilterBarProps {
  search: string;
  onSearchChange: (next: string) => void;
  filter: DateRangeFilterOption;
  onFilterChange: (next: DateRangeFilterOption) => void;
}

export function FilterBar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative w-full max-w-[400px]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA0AB]"
        >
          <SearchIcon size={16} />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Nhập tên, số điện thoại khách hàng, số hóa đơn"
          aria-label="Tìm kiếm hóa đơn"
          className={cn(
            "h-10 w-full rounded-lg border border-[#E1E3EA] bg-[#F4F5F7] pl-10 pr-4 text-[14px] text-[#1F2233]",
            "placeholder:italic placeholder:text-[#9CA0AB]",
            "focus:border-[#6366F1] focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-[#6366F1]/15",
          )}
        />
      </div>
      <DateRangeFilter value={filter} onChange={onFilterChange} />
    </div>
  );
}
