import { useState } from "react";
import { PosTextarea } from "@erp/pos/components/common/PosTextarea/PosTextarea";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosTextareaDemo = () => {
  const [note, setNote] = useState("");

  return (
    <div className="w-full max-w-sm">
      <PosTextarea
        value={note}
        onChange={setNote}
        placeholder="Ghi chú cho đơn hàng…"
        rows={3}
      />
    </div>
  );
};

export const posTextareaEntry: CatalogEntry = {
  id: "pos-textarea",
  name: "PosTextarea",
  category: "input",
  importPath: "@erp/pos/components/common/PosTextarea/PosTextarea",
  description:
    "Ô nhập nhiều dòng kiểu gạch chân, số dòng tối thiểu tự co theo kích thước.",
  props: [
    { name: "value", type: "string", required: true, description: "Giá trị hiện tại." },
    { name: "onChange", type: "(next: string) => void", required: true, description: "Gọi khi thay đổi." },
    { name: "placeholder", type: "string", required: false, description: "Văn bản gợi ý." },
    { name: "rows", type: "number", required: false, defaultValue: "2", description: "Số dòng (bị nâng lên tối thiểu theo size)." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"md"', description: "Cỡ chữ + chiều cao tối thiểu." },
    { name: "variant", type: '"underline"', required: false, defaultValue: '"underline"', description: "Kiểu hiển thị (hiện chỉ có underline)." },
    { name: "invalid", type: "boolean", required: false, description: "Báo lỗi (gạch chân đỏ)." },
    { name: "className", type: "string", required: false, description: "Class bổ sung." },
  ],
  usageNotes: [
    "Component controlled — truyền value và onChange.",
    "rows nhỏ hơn mức tối thiểu của size sẽ tự được nâng lên.",
  ],
  code: `const [note, setNote] = useState("");

<PosTextarea
  value={note}
  onChange={setNote}
  placeholder="Ghi chú cho đơn hàng…"
  rows={3}
/>`,
  Demo: PosTextareaDemo,
};
