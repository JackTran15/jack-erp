import { useState } from "react";
import { PosRadioGroup } from "@erp/pos/components/common/PosRadioGroup/PosRadioGroup";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

type ShipMethod = "store" | "delivery";

export const PosRadioGroupDemo = () => {
  const [value, setValue] = useState<ShipMethod>("store");

  return (
    <PosRadioGroup<ShipMethod>
      name="ship-method"
      value={value}
      onChange={setValue}
      ariaLabel="Hình thức giao"
      options={[
        { value: "store", label: "Nhận tại cửa hàng" },
        { value: "delivery", label: "Giao tận nơi" },
      ]}
    />
  );
};

export const posRadioGroupEntry: CatalogEntry = {
  id: "pos-radio-group",
  name: "PosRadioGroup",
  category: "input",
  importPath: "@erp/pos/components/common/PosRadioGroup/PosRadioGroup",
  description:
    "Nhóm nút radio (generic theo value string) với bố cục ngang/dọc, khoá theo từng option hoặc cả nhóm.",
  props: [
    { name: "name", type: "string", required: true, description: "Thuộc tính name chung cho các input radio." },
    { name: "value", type: "TValue", required: true, description: "Giá trị đang chọn." },
    { name: "onChange", type: "(next: TValue) => void", required: true, description: "Gọi khi chọn option khác." },
    { name: "options", type: "ReadonlyArray<PosRadioGroupOption<TValue>>", required: true, description: "Danh sách option ({ value, label, disabled? })." },
    { name: "layout", type: '"horizontal" | "vertical"', required: false, defaultValue: '"horizontal"', description: "Bố cục." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"sm"', description: "Kích thước radio + cỡ chữ." },
    { name: "ariaLabel", type: "string", required: false, description: "Nhãn trợ năng cho nhóm." },
    { name: "className", type: "string", required: false, description: "Class cho wrapper nhóm." },
    { name: "optionClassName", type: "string", required: false, description: "Class cho mỗi option." },
    { name: "disabled", type: "boolean", required: false, description: "Khoá toàn bộ nhóm (đè disabled từng option)." },
  ],
  usageNotes: [
    "Generic theo TValue extends string — truyền union để có gợi ý kiểu.",
    "Khoá riêng từng option qua option.disabled, hoặc khoá cả nhóm qua prop disabled.",
  ],
  code: `const [value, setValue] = useState<"store" | "delivery">("store");

<PosRadioGroup
  name="ship-method"
  value={value}
  onChange={setValue}
  options={[
    { value: "store", label: "Nhận tại cửa hàng" },
    { value: "delivery", label: "Giao tận nơi" },
  ]}
/>`,
  Demo: PosRadioGroupDemo,
};
