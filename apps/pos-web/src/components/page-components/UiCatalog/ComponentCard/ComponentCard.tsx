import { cn } from "@erp/ui";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";
import { CATEGORY_LABELS } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.registry";

export interface ComponentCardProps {
  entry: CatalogEntry;
  onSelect: (entry: CatalogEntry) => void;
}

/** Thẻ component trong lưới: tên + nhóm + mô tả + preview rút gọn (không tương tác). */
export const ComponentCard = ({ entry, onSelect }: ComponentCardProps) => {
  const Demo = entry.Demo;

  return (
    // Dùng div role="button" (không phải <button>) vì preview bên trong có thể
    // chứa các nút tương tác — <button> lồng <button> là HTML không hợp lệ.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(entry);
        }
      }}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all hover:-translate-y-0.5 hover:border-[#1a73e8] hover:shadow-[0_8px_24px_rgba(26,115,232,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40"
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <span className="truncate text-[15px] font-semibold text-gray-900">
          {entry.name}
        </span>
        <span className="shrink-0 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[11px] font-medium text-[#1a73e8]">
          {CATEGORY_LABELS[entry.category]}
        </span>
      </div>

      <p className="px-4 pt-2.5 text-[13px] leading-snug text-gray-500">
        {entry.description}
      </p>

      <div className="relative mt-3 flex max-h-[160px] min-h-[104px] items-center justify-center overflow-hidden border-t border-gray-100 bg-[#f7f8fa] px-4 py-5">
        <div className="pointer-events-none w-full max-w-full">
          <Demo />
        </div>
      </div>
    </div>
  );
};
