import { useState } from "react";
import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosFormItemDemo = () => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <PosFormItem label="Họ tên" htmlFor="demo-name" required>
        <PosTextInput
          id="demo-name"
          value={name}
          onChange={setName}
          placeholder="Nhập họ tên"
        />
      </PosFormItem>
      <PosFormItem
        label="Số điện thoại"
        htmlFor="demo-phone"
        error={phone && phone.length < 10 ? "Số điện thoại chưa hợp lệ" : undefined}
      >
        <PosTextInput
          id="demo-phone"
          value={phone}
          onChange={setPhone}
          placeholder="0901234567"
          inputMode="tel"
        />
      </PosFormItem>
    </div>
  );
};

export const posFormItemEntry: CatalogEntry = {
  id: "pos-form-item",
  name: "PosFormItem",
  category: "input",
  importPath: "@erp/pos/components/common/PosFormItem/PosFormItem",
  description:
    "Hàng form chung: nhãn + control + lỗi inline. Hỗ trợ bố cục dọc/ngang, dấu * bắt buộc và canh nhãn lên đầu cho control nhiều dòng.",
  props: [
    { name: "label", type: "ReactNode", required: true, description: "Nội dung nhãn (thường là chuỗi)." },
    { name: "children", type: "ReactNode", required: true, description: "Control bên trong (input, select…)." },
    { name: "htmlFor", type: "string", required: false, description: "Gắn nhãn với control qua htmlFor." },
    { name: "required", type: "boolean", required: false, description: "Hiện dấu * đỏ sau nhãn." },
    { name: "error", type: "ReactNode", required: false, description: "Thông báo lỗi hiển thị dưới control." },
    { name: "layout", type: '"vertical" | "horizontal"', required: false, defaultValue: '"vertical"', description: "Bố cục nhãn/control." },
    { name: "alignTop", type: "boolean", required: false, description: "Canh nhãn lên đầu (control nhiều dòng)." },
    { name: "controlSize", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"md"', description: "Khớp size control để canh nhãn ngang khi alignTop." },
    { name: "className", type: "string", required: false, description: "Class wrapper." },
    { name: "labelClassName", type: "string", required: false, description: "Class nhãn." },
    { name: "contentClassName", type: "string", required: false, description: "Class vùng control." },
  ],
  usageNotes: [
    "Dùng htmlFor + id của control để click nhãn focus đúng ô.",
    "Truyền error để hiện thông báo lỗi (role=alert) bên dưới control.",
    "layout=\"horizontal\" hợp cho thanh lọc gọn; \"vertical\" cho form.",
  ],
  code: `<PosFormItem label="Họ tên" htmlFor="name" required>
  <PosTextInput id="name" value={name} onChange={setName} />
</PosFormItem>`,
  Demo: PosFormItemDemo,
};
