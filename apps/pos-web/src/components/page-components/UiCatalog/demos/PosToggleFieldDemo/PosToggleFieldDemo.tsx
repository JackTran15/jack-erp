import { useState } from "react";
import { PosToggleField } from "@erp/pos/components/common/PosToggleField/PosToggleField";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosToggleFieldDemo = () => {
  const [split, setSplit] = useState(true);
  const [print, setPrint] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <PosToggleField label="Tách dòng" checked={split} onChange={setSplit} />
      <PosToggleField label="In hoá đơn" checked={print} onChange={setPrint} />
    </div>
  );
};

export const posToggleFieldEntry: CatalogEntry = {
  id: "pos-toggle-field",
  name: "PosToggleField",
  category: "input",
  importPath: "@erp/pos/components/common/PosToggleField/PosToggleField",
  description:
    "Cụm “nhãn + công tắc” đặt cạnh nhau, gói sẵn bố cục để dùng lại (vd “Tách dòng”, “In hoá đơn”).",
  props: [
    { name: "label", type: "string", required: true, description: "Nhãn hiển thị bên trái công tắc." },
    { name: "checked", type: "boolean", required: true, description: "Trạng thái bật/tắt." },
    { name: "onChange", type: "(next: boolean) => void", required: true, description: "Gọi khi gạt công tắc." },
  ],
  usageNotes: [
    "Bọc sẵn PosToggle + nhãn để khỏi lặp layout ở mỗi chỗ dùng.",
    "label được dùng luôn làm aria-label cho công tắc bên trong.",
  ],
  code: `const [print, setPrint] = useState(false);

<PosToggleField label="In hoá đơn" checked={print} onChange={setPrint} />`,
  Demo: PosToggleFieldDemo,
};
