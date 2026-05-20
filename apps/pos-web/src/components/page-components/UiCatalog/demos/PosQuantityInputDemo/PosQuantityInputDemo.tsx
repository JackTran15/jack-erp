import { useState } from "react";
import { PosQuantityInput } from "@erp/pos/components/common/PosQuantityInput/PosQuantityInput";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosQuantityInputDemo = () => {
  const [qty, setQty] = useState(1);

  return (
    <div className="w-full max-w-[160px]">
      <PosQuantityInput
        displayValue={qty}
        onChangeRaw={(raw) => setQty(Math.max(0, Number(raw) || 0))}
        onBumpUp={() => setQty((q) => q + 1)}
        onBumpDown={() => setQty((q) => Math.max(0, q - 1))}
        bumpDownDisabled={qty <= 0}
        min={0}
        ariaLabel="Số lượng"
      />
    </div>
  );
};

export const posQuantityInputEntry: CatalogEntry = {
  id: "pos-quantity-input",
  name: "PosQuantityInput",
  category: "input",
  importPath: "@erp/pos/components/common/PosQuantityInput/PosQuantityInput",
  description:
    "Ô nhập số lượng kèm nút tăng/giảm (stepper). Steppers chỉ hiện khi truyền cả onBumpUp và onBumpDown.",
  props: [
    { name: "displayValue", type: "number", required: true, description: "Số lượng đang hiển thị." },
    { name: "onChangeRaw", type: "(raw: string) => void", required: true, description: "Gọi với chuỗi thô khi gõ — host tự parse/giới hạn." },
    { name: "onBumpUp", type: "() => void", required: false, description: "Tăng 1 đơn vị (kèm onBumpDown để hiện stepper)." },
    { name: "onBumpDown", type: "() => void", required: false, description: "Giảm 1 đơn vị." },
    { name: "bumpUpDisabled", type: "boolean", required: false, description: "Khoá nút tăng." },
    { name: "bumpDownDisabled", type: "boolean", required: false, description: "Khoá nút giảm." },
    { name: "min", type: "number", required: false, description: "min của thẻ input." },
    { name: "max", type: "number", required: false, description: "max của thẻ input." },
    { name: "itemLabel", type: "string", required: false, description: "Tên mặt hàng — ghép vào aria-label của stepper." },
    { name: "ariaLabel", type: "string", required: false, description: "Nhãn trợ năng cho input." },
    { name: "disabled", type: "boolean", required: false, description: "Vô hiệu hoá." },
    { name: "variant", type: '"boxed" | "underline" | "ghost"', required: false, defaultValue: '"boxed"', description: "Kiểu hiển thị." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl"', required: false, defaultValue: '"md"', description: "Chiều cao control." },
    { name: "className", type: "string", required: false, description: "Class wrapper." },
    { name: "leading", type: "ReactNode", required: false, description: "Slot đầu input." },
    { name: "trailing", type: "ReactNode", required: false, description: "Slot cuối input (đơn vị…)." },
    { name: "inputRef", type: "Ref<HTMLInputElement>", required: false, description: "Ref tới input." },
    { name: "onKeyDown", type: "(e: KeyboardEvent<HTMLInputElement>) => void", required: false, description: "Bắt phím (vd Enter để commit)." },
  ],
  usageNotes: [
    "Khác PosNumberInput: trả về chuỗi thô qua onChangeRaw để host tự kiểm soát giới hạn.",
    "Chỉ hiện 2 nút stepper khi truyền cả onBumpUp lẫn onBumpDown.",
    "variant=\"underline\" ẩn stepper cho tới khi hover/focus.",
  ],
  code: `const [qty, setQty] = useState(1);

<PosQuantityInput
  displayValue={qty}
  onChangeRaw={(raw) => setQty(Math.max(0, Number(raw) || 0))}
  onBumpUp={() => setQty((q) => q + 1)}
  onBumpDown={() => setQty((q) => Math.max(0, q - 1))}
  bumpDownDisabled={qty <= 0}
  ariaLabel="Số lượng"
/>`,
  Demo: PosQuantityInputDemo,
};
