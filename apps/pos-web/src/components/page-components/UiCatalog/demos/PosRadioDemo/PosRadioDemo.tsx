import { useState } from "react";
import { PosRadio } from "@erp/pos/components/common/PosRadio/PosRadio";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosRadioDemo = () => {
  const [selected, setSelected] = useState<"a" | "b">("a");

  return (
    <div className="flex items-center gap-6">
      <button
        type="button"
        onClick={() => setSelected("a")}
        className="inline-flex items-center gap-2 text-sm text-gray-800"
      >
        <PosRadio selected={selected === "a"} />
        Lựa chọn A
      </button>
      <button
        type="button"
        onClick={() => setSelected("b")}
        className="inline-flex items-center gap-2 text-sm text-gray-800"
      >
        <PosRadio selected={selected === "b"} />
        Lựa chọn B
      </button>
    </div>
  );
};

export const posRadioEntry: CatalogEntry = {
  id: "pos-radio",
  name: "PosRadio",
  category: "input",
  importPath: "@erp/pos/components/common/PosRadio/PosRadio",
  description:
    "Chỉ báo radio (chấm tròn) thuần hiển thị. Không tự quản lý trạng thái — bọc trong <label>/<button> để xử lý chọn.",
  props: [
    { name: "selected", type: "boolean", required: true, description: "Đang được chọn hay không." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"sm"', description: "Kích thước vòng tròn." },
    { name: "className", type: "string", required: false, description: "Class bổ sung." },
  ],
  usageNotes: [
    "Đây là phần hiển thị thuần — bao ngoài bằng <label>/<button> để xử lý chọn.",
    'Gói nhiều PosRadio trong một <div role="radiogroup"> để tạo nhóm.',
  ],
  code: `<button onClick={() => setValue("a")} className="inline-flex items-center gap-2">
  <PosRadio selected={value === "a"} />
  Lựa chọn A
</button>`,
  Demo: PosRadioDemo,
};
