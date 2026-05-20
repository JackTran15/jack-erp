import { useState } from "react";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import { SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosTextInputDemo = () => {
  const [boxed, setBoxed] = useState("Nguyễn Văn A");
  const [underline, setUnderline] = useState("");
  const [search, setSearch] = useState("");

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <PosTextInput
        value={boxed}
        onChange={setBoxed}
        placeholder="Nhập họ tên…"
        ariaLabel="Họ tên"
      />
      <PosTextInput
        value={underline}
        onChange={setUnderline}
        variant="underline"
        placeholder="Kiểu gạch chân"
        ariaLabel="Underline"
      />
      <PosTextInput
        value={search}
        onChange={setSearch}
        placeholder="Tìm kiếm…"
        ariaLabel="Tìm kiếm"
        trailing={<SearchIcon size={16} className="text-gray-400" />}
      />
    </div>
  );
};

export const posTextInputEntry: CatalogEntry = {
  id: "pos-text-input",
  name: "PosTextInput",
  category: "input",
  importPath: "@erp/pos/components/common/PosTextInput/PosTextInput",
  description:
    "Ô nhập văn bản với 3 kiểu (boxed, underline, ghost), 4 kích thước, hỗ trợ slot trailing và trạng thái lỗi / chỉ-đọc.",
  props: [
    { name: "value", type: "string", required: true, description: "Giá trị hiện tại (controlled)." },
    { name: "onChange", type: "(next: string) => void", required: true, description: "Gọi khi giá trị thay đổi." },
    { name: "id", type: "string", required: false, description: "id gắn cho thẻ input (dùng với label htmlFor)." },
    { name: "type", type: '"text" | "tel" | "email" | "date" | "search"', required: false, defaultValue: '"text"', description: "Loại input HTML." },
    { name: "placeholder", type: "string", required: false, description: "Văn bản gợi ý khi rỗng." },
    { name: "align", type: '"left" | "right"', required: false, defaultValue: '"left"', description: "Căn lề nội dung." },
    { name: "variant", type: '"boxed" | "underline" | "ghost"', required: false, defaultValue: '"boxed"', description: "Kiểu hiển thị." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"md"', description: "Chiều cao control." },
    { name: "invalid", type: "boolean", required: false, description: "Tô viền đỏ báo lỗi." },
    { name: "readOnly", type: "boolean", required: false, description: "Chỉ đọc." },
    { name: "disabled", type: "boolean", required: false, description: "Vô hiệu hoá." },
    { name: "trailing", type: "ReactNode", required: false, description: "Nội dung gắn cuối ô (icon, nút…)." },
    { name: "onBlur", type: "() => void", required: false, description: "Gọi khi rời khỏi ô." },
    { name: "inputMode", type: '"text" | "tel" | "email" | "numeric" | "search"', required: false, description: "Gợi ý bàn phím di động." },
    { name: "autoComplete", type: "string", required: false, description: "Thuộc tính autocomplete." },
    { name: "ariaLabel", type: "string", required: false, description: "Nhãn cho trình đọc màn hình." },
    { name: "className", type: "string", required: false, description: "Class cho wrapper." },
    { name: "inputClassName", type: "string", required: false, description: "Class cho thẻ input." },
    { name: "inputRef", type: "Ref<HTMLInputElement>", required: false, description: "Ref tới input để focus/select chủ động." },
  ],
  usageNotes: [
    "Component controlled — luôn truyền cả value và onChange.",
    "Dùng variant=\"underline\" trong các thanh lọc/bảng; \"boxed\" cho form thường.",
    "Đặt icon hoặc nút phụ qua prop trailing.",
  ],
  code: `const [name, setName] = useState("");

<PosTextInput
  value={name}
  onChange={setName}
  placeholder="Nhập họ tên…"
  ariaLabel="Họ tên"
  trailing={<SearchIcon size={16} className="text-gray-400" />}
/>`,
  Demo: PosTextInputDemo,
};
