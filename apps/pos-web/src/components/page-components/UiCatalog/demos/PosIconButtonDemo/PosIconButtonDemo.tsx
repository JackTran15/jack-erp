import { useState } from "react";
import { PosIconButton } from "@erp/pos/components/common/PosIconButton/PosIconButton";
import {
  RefreshIcon,
  SearchIcon,
  TagIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosIconButtonDemo = () => {
  const [active, setActive] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <PosIconButton icon={<SearchIcon size={18} />} ariaLabel="Tìm kiếm" />
      <PosIconButton icon={<RefreshIcon size={18} />} ariaLabel="Làm mới" />
      <PosIconButton
        icon={<TagIcon size={18} />}
        ariaLabel="Bật khuyến mãi"
        active={active}
        onClick={() => setActive((a) => !a)}
      />
    </div>
  );
};

export const posIconButtonEntry: CatalogEntry = {
  id: "pos-icon-button",
  name: "PosIconButton",
  category: "display",
  importPath: "@erp/pos/components/common/PosIconButton/PosIconButton",
  description:
    "Nút chỉ-icon vuông 32×32, bo góc, hover sáng nền, có trạng thái active. Kế thừa mọi thuộc tính của <button>.",
  props: [
    { name: "icon", type: "ReactNode", required: true, description: "Node icon cần render." },
    { name: "ariaLabel", type: "string", required: true, description: "Bắt buộc cho trợ năng — mô tả hành động." },
    { name: "active", type: "boolean", required: false, description: "Tô màu nhấn khi đang active." },
    { name: "...rest", type: "ButtonHTMLAttributes<HTMLButtonElement>", required: false, description: "onClick, disabled, type, … truyền thẳng cho <button>." },
  ],
  usageNotes: [
    "ariaLabel bắt buộc vì nút không có chữ.",
    "Dùng active để thể hiện trạng thái mở popover/bật bộ lọc.",
    "Hỗ trợ forwardRef — lấy ref để focus chủ động.",
  ],
  code: `<PosIconButton
  icon={<SearchIcon size={18} />}
  ariaLabel="Tìm kiếm"
  onClick={onSearch}
/>`,
  Demo: PosIconButtonDemo,
};
