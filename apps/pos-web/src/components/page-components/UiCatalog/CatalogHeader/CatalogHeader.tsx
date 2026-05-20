import { cn } from "@erp/ui";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import { SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { CatalogCategory } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@erp/pos/components/page-components/UiCatalog/ui-catalog.registry";

export type CatalogCategoryFilter = CatalogCategory | "all";

export interface CatalogHeaderProps {
  query: string;
  onQueryChange: (next: string) => void;
  category: CatalogCategoryFilter;
  onCategoryChange: (next: CatalogCategoryFilter) => void;
  counts: Record<CatalogCategoryFilter, number>;
}

/** Thanh đầu trang: tiêu đề + ô tìm kiếm + tab lọc theo nhóm. */
export const CatalogHeader = ({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  counts,
}: CatalogHeaderProps) => {
  const tabs: CatalogCategoryFilter[] = ["all", ...CATEGORY_ORDER];
  const labelOf = (c: CatalogCategoryFilter) =>
    c === "all" ? "Tất cả" : CATEGORY_LABELS[c];

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900">
              Thư viện Component POS
            </h1>
            <p className="mt-1 text-[13px] text-gray-500">
              Tất cả common component trong{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px]">
                components/common
              </code>
              . Nhấn vào một thẻ để xem chi tiết.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <PosTextInput
              value={query}
              onChange={onQueryChange}
              placeholder="Tìm component…"
              ariaLabel="Tìm component"
              size="lg"
              trailing={<SearchIcon size={16} className="text-gray-400" />}
            />
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const active = category === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onCategoryChange(tab)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-[#1a73e8] bg-[#1a73e8] text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                {labelOf(tab)}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px]",
                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {counts[tab]}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
