import { useMemo, useState } from "react";
import {
  CatalogHeader,
  type CatalogCategoryFilter,
} from "@erp/pos/components/page-components/UiCatalog/CatalogHeader/CatalogHeader";
import { ComponentGallery } from "@erp/pos/components/page-components/UiCatalog/ComponentGallery/ComponentGallery";
import { ComponentDetailDrawer } from "@erp/pos/components/page-components/UiCatalog/ComponentDetailDrawer/ComponentDetailDrawer";
import { UI_CATALOG_ENTRIES } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.registry";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

const matchesQuery = (entry: CatalogEntry, q: string) =>
  q === "" ||
  entry.name.toLowerCase().includes(q) ||
  entry.description.toLowerCase().includes(q);

/** Trang showcase common component của pos-web — route /ui, không cần đăng nhập. */
export const UiCatalogPage = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogCategoryFilter>("all");
  const [selected, setSelected] = useState<CatalogEntry | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return UI_CATALOG_ENTRIES.filter(
      (e) => (category === "all" || e.category === category) && matchesQuery(e, q),
    );
  }, [query, category]);

  const counts = useMemo<Record<CatalogCategoryFilter, number>>(() => {
    const q = query.trim().toLowerCase();
    const result: Record<CatalogCategoryFilter, number> = {
      all: 0,
      input: 0,
      display: 0,
      overlay: 0,
      domain: 0,
    };
    for (const entry of UI_CATALOG_ENTRIES) {
      if (!matchesQuery(entry, q)) continue;
      result.all += 1;
      result[entry.category] += 1;
    }
    return result;
  }, [query]);

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-gray-900">
      <CatalogHeader
        query={query}
        onQueryChange={setQuery}
        category={category}
        onCategoryChange={setCategory}
        counts={counts}
      />
      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <ComponentGallery entries={filtered} onSelect={setSelected} />
      </main>
      <ComponentDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
};
