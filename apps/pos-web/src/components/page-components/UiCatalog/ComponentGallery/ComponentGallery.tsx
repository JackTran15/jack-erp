import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@erp/pos/components/page-components/UiCatalog/ui-catalog.registry";
import { ComponentCard } from "@erp/pos/components/page-components/UiCatalog/ComponentCard/ComponentCard";

export interface ComponentGalleryProps {
  entries: CatalogEntry[];
  onSelect: (entry: CatalogEntry) => void;
}

/** Lưới component, gom theo nhóm. Hiện empty-state khi không có kết quả. */
export const ComponentGallery = ({ entries, onSelect }: ComponentGalleryProps) => {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-24 text-center">
        <p className="text-base font-medium text-gray-700">
          Không tìm thấy component
        </p>
        <p className="text-sm text-gray-500">
          Thử từ khoá khác hoặc chọn nhóm “Tất cả”.
        </p>
      </div>
    );
  }

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: entries.filter((e) => e.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => (
        <section key={group.cat}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-gray-900">
              {CATEGORY_LABELS[group.cat]}
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[12px] text-gray-500">
              {group.items.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.items.map((entry) => (
              <ComponentCard key={entry.id} entry={entry} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
