import {
  PlusIcon,
  SearchIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";

export interface LabelSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  addFormOpen: boolean;
  onToggleAddForm: () => void;
}

export function LabelSearchBar({
  query,
  onQueryChange,
  addFormOpen,
  onToggleAddForm,
}: LabelSearchBarProps) {
  return (
    <div className="relative">
      <SearchIcon
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Tìm kiếm"
        className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8F9FE] pl-10 pr-12 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/15"
      />
      <button
        type="button"
        onClick={onToggleAddForm}
        aria-label="Thêm nhãn mới"
        aria-expanded={addFormOpen}
        className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#22C55E] text-white shadow-[0_0_0_3px_rgba(34,197,94,0.18)] transition-colors hover:bg-[#16A34A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] focus-visible:ring-offset-2"
      >
        <PlusIcon size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
