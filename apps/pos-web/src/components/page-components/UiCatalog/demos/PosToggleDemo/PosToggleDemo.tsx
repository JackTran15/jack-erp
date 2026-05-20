import { useState } from "react";
import { PosToggle } from "@erp/pos/components/common/PosToggle/PosToggle";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosToggleDemo = () => {
  const [on, setOn] = useState(true);

  return (
    <div className="flex items-center gap-4">
      <PosToggle checked={on} onChange={setOn} ariaLabel="Bật/tắt" />
      <span className="text-sm text-gray-600">{on ? "Đang bật" : "Đang tắt"}</span>
    </div>
  );
};

export const posToggleEntry: CatalogEntry = {
  id: "pos-toggle",
  name: "PosToggle",
  category: "input",
  importPath: "@erp/pos/components/common/PosToggle/PosToggle",
  description:
    "Công tắc bật/tắt (switch) với 4 kích thước. Bật có màu xanh lá.",
  props: [
    { name: "checked", type: "boolean", required: true, description: "Trạng thái bật/tắt." },
    { name: "onChange", type: "(next: boolean) => void", required: true, description: "Gọi khi gạt công tắc." },
    { name: "ariaLabel", type: "string", required: true, description: "Nhãn trợ năng (bắt buộc)." },
    { name: "disabled", type: "boolean", required: false, description: "Vô hiệu hoá." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"md"', description: "Kích thước công tắc." },
  ],
  usageNotes: [
    "ariaLabel là bắt buộc vì công tắc không có nhãn đi kèm.",
    "Cần kèm nhãn hiển thị thì dùng PosToggleField.",
  ],
  code: `const [on, setOn] = useState(false);

<PosToggle checked={on} onChange={setOn} ariaLabel="In hoá đơn" />`,
  Demo: PosToggleDemo,
};
