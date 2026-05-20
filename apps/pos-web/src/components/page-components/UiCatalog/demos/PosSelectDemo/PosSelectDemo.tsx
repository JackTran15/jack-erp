import { useState } from "react";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

interface Branch {
  id: string;
  name: string;
  address: string;
}

const BRANCHES: Branch[] = [
  { id: "hcm", name: "Chi nhánh Quận 1", address: "TP. Hồ Chí Minh" },
  { id: "hn", name: "Chi nhánh Hà Nội", address: "Quận Hoàn Kiếm" },
  { id: "dn", name: "Chi nhánh Đà Nẵng", address: "Quận Hải Châu" },
];

export const PosSelectDemo = () => {
  const [branch, setBranch] = useState<Branch | null>(BRANCHES[0]);

  return (
    <div className="w-full max-w-xs">
      <PosSelect<Branch>
        value={branch}
        onChange={setBranch}
        items={BRANCHES}
        itemKey={(b) => b.id}
        renderItem={(b) => b.name}
        renderMeta={(b) => b.address}
        ariaLabel="Chi nhánh"
        placeholder="Chọn chi nhánh"
      />
    </div>
  );
};

export const posSelectEntry: CatalogEntry = {
  id: "pos-select",
  name: "PosSelect",
  category: "input",
  importPath: "@erp/pos/components/common/PosSelect/PosSelect",
  description:
    "Dropdown chọn một (generic) cho danh sách tĩnh: điều hướng bàn phím, menu portal ra body, kiểu boxed/underline.",
  props: [
    { name: "value", type: "T | null", required: false, description: "Item đang chọn (null khi chưa chọn)." },
    { name: "onChange", type: "(item: T) => void", required: true, description: "Gọi khi chọn item." },
    { name: "items", type: "ReadonlyArray<T>", required: true, description: "Toàn bộ danh sách option." },
    { name: "itemKey", type: "(item: T) => string", required: true, description: "Khoá duy nhất cho mỗi item." },
    { name: "renderItem", type: "(item: T) => ReactNode", required: true, description: "Render dòng chính trong dropdown." },
    { name: "renderMeta", type: "(item: T) => ReactNode", required: false, description: "Dòng phụ dưới dòng chính." },
    { name: "renderSelected", type: "(item: T) => ReactNode", required: false, defaultValue: "renderItem", description: "Nội dung hiển thị ở trigger khi đã chọn." },
    { name: "isItemDisabled", type: "(item: T) => boolean", required: false, description: "Khoá theo từng item." },
    { name: "id", type: "string", required: false, description: "id cho nút trigger." },
    { name: "ariaLabel", type: "string", required: false, description: "Nhãn trợ năng." },
    { name: "placeholder", type: "string", required: false, description: "Hiển thị khi chưa chọn." },
    { name: "emptyText", type: "string", required: false, defaultValue: '"Không có kết quả"', description: "Văn bản khi danh sách rỗng." },
    { name: "variant", type: '"boxed" | "underline"', required: false, defaultValue: '"boxed"', description: "Kiểu hiển thị." },
    { name: "position", type: '"top" | "bottom"', required: false, defaultValue: '"bottom"', description: "Hướng mở menu." },
    { name: "showChevron", type: "boolean", required: false, defaultValue: "true", description: "Hiện mũi tên xổ." },
    { name: "invalid", type: "boolean", required: false, description: "Báo lỗi." },
    { name: "disabled", type: "boolean", required: false, description: "Vô hiệu hoá." },
    { name: "prefix", type: "ReactNode", required: false, description: "Slot đầu trigger." },
    { name: "trailing", type: "ReactNode", required: false, description: "Slot cuối trigger." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"md"', description: "Chiều cao (chỉ boxed)." },
    { name: "className / menuClassName / triggerClassName", type: "string", required: false, description: "Class cho wrapper / menu / trigger." },
  ],
  usageNotes: [
    "Dùng cho danh sách tĩnh; cần gõ-để-lọc thì dùng PosSelectSearch (cùng shape generic).",
    "Menu được portal ra document.body — tránh đặt trong container overflow-hidden.",
    "position=\"top\" hữu ích khi select nằm ở footer (vd chọn số dòng/trang).",
  ],
  code: `const [branch, setBranch] = useState<Branch | null>(null);

<PosSelect
  value={branch}
  onChange={setBranch}
  items={branches}
  itemKey={(b) => b.id}
  renderItem={(b) => b.name}
  renderMeta={(b) => b.address}
  placeholder="Chọn chi nhánh"
/>`,
  Demo: PosSelectDemo,
};
