import { useState } from "react";
import { PosSelectSearch } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import { SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

interface Product {
  id: string;
  name: string;
  sku: string;
}

const PRODUCTS: Product[] = [
  { id: "1", name: "Cà phê sữa đá", sku: "CF-001" },
  { id: "2", name: "Trà đào cam sả", sku: "TD-002" },
  { id: "3", name: "Bạc xỉu", sku: "BX-003" },
  { id: "4", name: "Nước suối", sku: "NS-004" },
];

export const PosSelectSearchDemo = () => {
  const [product, setProduct] = useState<Product | null>(null);

  return (
    <div className="w-full max-w-xs">
      <PosSelectSearch<Product>
        value={product}
        onChange={setProduct}
        search={(q) => {
          const lower = q.trim().toLowerCase();
          return PRODUCTS.filter(
            (p) =>
              p.name.toLowerCase().includes(lower) ||
              p.sku.toLowerCase().includes(lower),
          ).map((item) => ({ item }));
        }}
        itemKey={(p) => p.id}
        renderItem={(p) => p.name}
        renderMeta={(p) => p.sku}
        renderSelected={(p) => p.name}
        placeholder="Tìm sản phẩm…"
        leadingIcon={<SearchIcon size={16} />}
      />
    </div>
  );
};

export const posSelectSearchEntry: CatalogEntry = {
  id: "pos-select-search",
  name: "PosSelectSearch",
  category: "input",
  importPath: "@erp/pos/components/common/PosSelectSearch/PosSelectSearch",
  description:
    "Combobox: ô input vừa là trigger vừa là ô tìm. Lọc đồng bộ qua hàm search, điều hướng bàn phím, menu portal ra body.",
  props: [
    { name: "value", type: "T | null", required: false, description: "Item đang chọn." },
    { name: "onChange", type: "(item: T) => void", required: true, description: "Gọi khi chọn item." },
    { name: "search", type: "(query: string) => ReadonlyArray<PosSelectSearchSuggestion<T>>", required: true, description: "Lọc đồng bộ — trả gợi ý theo query." },
    { name: "itemKey", type: "(item: T) => string", required: true, description: "Khoá duy nhất." },
    { name: "renderItem", type: "(item: T) => ReactNode", required: true, description: "Render dòng chính." },
    { name: "renderMeta", type: "(item: T) => ReactNode", required: false, description: "Dòng phụ." },
    { name: "renderSelected", type: "(item: T) => string", required: true, description: "Chuỗi hiển thị trong input khi đã chọn." },
    { name: "placeholder", type: "string", required: true, description: "Gợi ý khi chưa chọn." },
    { name: "shortcut", type: "string", required: false, description: "Phím tắt ghép vào placeholder, vd \"Alt + N\"." },
    { name: "leadingIcon", type: "ReactNode", required: false, description: "Icon đầu input." },
    { name: "emptyText", type: "string", required: false, defaultValue: '"Không có kết quả"', description: "Khi không có gợi ý." },
    { name: "disabled", type: "boolean", required: false, description: "Vô hiệu hoá." },
    { name: "ariaLabel", type: "string", required: false, description: "Nhãn trợ năng." },
    { name: "onQueryChange", type: "(query: string) => void", required: false, description: "Gọi khi gõ — dùng cho tìm async phía ngoài." },
    { name: "position", type: '"bottom" | "top"', required: false, defaultValue: '"bottom"', description: "Hướng mở menu." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"md"', description: "Chiều cao." },
    { name: "variant", type: '"boxed" | "underline"', required: false, defaultValue: '"boxed"', description: "Kiểu hiển thị." },
    { name: "className / menuClassName", type: "string", required: false, description: "Class wrapper / menu." },
  ],
  usageNotes: [
    "search là đồng bộ — host tự quyết chiến lược lọc (substring, fuzzy, hoặc bọc state async).",
    "Cần gọi API khi gõ thì kết hợp onQueryChange với danh sách suy ra từ state ngoài.",
    "Menu portal ra document.body như PosSelect.",
  ],
  code: `const [product, setProduct] = useState<Product | null>(null);

<PosSelectSearch
  value={product}
  onChange={setProduct}
  search={(q) =>
    products
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
      .map((item) => ({ item }))
  }
  itemKey={(p) => p.id}
  renderItem={(p) => p.name}
  renderSelected={(p) => p.name}
  placeholder="Tìm sản phẩm…"
/>`,
  Demo: PosSelectSearchDemo,
};
