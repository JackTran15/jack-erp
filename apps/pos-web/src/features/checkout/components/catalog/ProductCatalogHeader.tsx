import { BoxIcon, SearchIcon } from "@erp/pos/components/icons/Icon";
import { DropdownButton } from "../common/DropdownButton";
import { KeyboardHint } from "../common/KeyboardHint";

export interface ProductCatalogHeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  group?: string;
  onPickGroup?: () => void;
}

/**
 * Section header for the product catalog: uppercase label + search input +
 * group filter dropdown.
 */
export function ProductCatalogHeader({
  query,
  onQueryChange,
  group,
  onPickGroup,
}: ProductCatalogHeaderProps) {
  return (
    <div className="flex h-12 items-center gap-3 border-b border-gray-200 bg-white px-3">
      <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-gray-700">
        Tư vấn bán hàng
      </span>

      <label className="relative ml-auto block w-[280px]">
        <SearchIcon
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder=""
          className="h-9 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        {query.length === 0 ? (
          <span className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">
            <KeyboardHint>(Shift + F3)</KeyboardHint> Tìm kiếm
          </span>
        ) : null}
      </label>

      <DropdownButton
        leading={<BoxIcon size={16} className="text-gray-500" />}
        onClick={onPickGroup}
        className="min-w-[220px]"
      >
        {group ? (
          group
        ) : (
          <span className="text-gray-400">Lọc theo nhóm hàng hóa</span>
        )}
      </DropdownButton>
    </div>
  );
}
