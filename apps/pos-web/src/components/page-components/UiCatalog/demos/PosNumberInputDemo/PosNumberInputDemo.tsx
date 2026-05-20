import { useState } from "react";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosNumberInputDemo = () => {
  const [price, setPrice] = useState(150000);
  const [boxed, setBoxed] = useState(12);

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <PosNumberInput value={price} onChange={setPrice} ariaLabel="Giá tiền" />
      <PosNumberInput
        value={boxed}
        onChange={setBoxed}
        variant="boxed"
        min={0}
        max={999}
        ariaLabel="Số lượng"
      />
    </div>
  );
};

export const posNumberInputEntry: CatalogEntry = {
  id: "pos-number-input",
  name: "PosNumberInput",
  category: "input",
  importPath: "@erp/pos/components/common/PosNumberInput/PosNumberInput",
  description:
    "Ô nhập số với parser/formatter tuỳ biến (mặc định định dạng tiền VND), căn phải, nhiều kiểu và kích thước.",
  props: [
    { name: "value", type: "number", required: true, description: "Giá trị số hiện tại." },
    { name: "onChange", type: "(next: number) => void", required: true, description: "Gọi khi số thay đổi (đã parse)." },
    { name: "min", type: "number", required: false, description: "Giá trị nhỏ nhất." },
    { name: "max", type: "number", required: false, description: "Giá trị lớn nhất." },
    { name: "step", type: "number", required: false, defaultValue: "1", description: "Bước nhảy." },
    { name: "readOnly", type: "boolean", required: false, description: "Chỉ đọc." },
    { name: "ref", type: "Ref<HTMLInputElement>", required: false, description: "Ref tới input." },
    { name: "parser", type: "(raw: string) => number | null", required: false, description: "Hàm parse chuỗi nhập thành số; mặc định bỏ ký tự không phải số." },
    { name: "formatter", type: "(value: number) => string", required: false, defaultValue: "formatVnd", description: "Hàm định dạng số để hiển thị." },
    { name: "displayValue", type: "string", required: false, description: "Ghi đè chuỗi hiển thị (tách khỏi value)." },
    { name: "placeholder", type: "string", required: false, description: "Văn bản gợi ý." },
    { name: "ariaLabel", type: "string", required: false, description: "Nhãn trợ năng." },
    { name: "inputMode", type: '"numeric" | "decimal"', required: false, defaultValue: '"numeric"', description: "Bàn phím số trên di động." },
    { name: "align", type: '"left" | "right"', required: false, defaultValue: '"right"', description: "Căn lề." },
    { name: "variant", type: '"boxed" | "underline" | "ghost"', required: false, defaultValue: '"ghost"', description: "Kiểu hiển thị." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"md"', description: "Chiều cao control." },
    { name: "invalid", type: "boolean", required: false, description: "Báo lỗi." },
    { name: "className", type: "string", required: false, description: "Class wrapper." },
    { name: "inputClassName", type: "string", required: false, description: "Class input." },
  ],
  usageNotes: [
    "Mặc định hiển thị theo định dạng tiền VND (formatVnd) và căn phải.",
    "Truyền parser/formatter riêng khi cần đơn vị khác (số lượng, %, …).",
    "variant=\"ghost\" bỏ viền — dùng trong ô số liền mạch của bảng.",
  ],
  code: `const [price, setPrice] = useState(150000);

<PosNumberInput
  value={price}
  onChange={setPrice}
  variant="boxed"
  ariaLabel="Giá tiền"
/>`,
  Demo: PosNumberInputDemo,
};
