import { useState } from "react";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosCheckboxDemo = () => {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <PosCheckbox checked={a} onChange={setA} label="Áp dụng khuyến mãi" />
      <PosCheckbox checked={b} onChange={setB} label="Xuất hoá đơn VAT" size="md" />
      <PosCheckbox checked onChange={() => {}} label="Đã khoá" disabled />
    </div>
  );
};

export const posCheckboxEntry: CatalogEntry = {
  id: "pos-checkbox",
  name: "PosCheckbox",
  category: "input",
  importPath: "@erp/pos/components/common/PosCheckbox/PosCheckbox",
  description:
    "Ô tích (checkbox) tuỳ biến với 4 kích thước và nhãn tuỳ chọn. Hỗ trợ Enter để bật/tắt.",
  props: [
    { name: "checked", type: "boolean", required: true, description: "Trạng thái tích." },
    { name: "onChange", type: "(next: boolean) => void", required: true, description: "Gọi khi đổi trạng thái." },
    { name: "ariaLabel", type: "string", required: false, description: "Nhãn trợ năng (khi không có label)." },
    { name: "className", type: "string", required: false, description: "Class cho thẻ label bao ngoài." },
    { name: "label", type: "string", required: false, description: "Nhãn hiển thị bên phải ô tích." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"sm"', description: "Kích thước ô tích." },
    { name: "disabled", type: "boolean", required: false, defaultValue: "false", description: "Vô hiệu hoá." },
  ],
  usageNotes: [
    "Component controlled — truyền checked và onChange.",
    "Nếu không có label, nên đặt ariaLabel cho trợ năng.",
  ],
  code: `const [checked, setChecked] = useState(false);

<PosCheckbox
  checked={checked}
  onChange={setChecked}
  label="Xuất hoá đơn VAT"
/>`,
  Demo: PosCheckboxDemo,
};
