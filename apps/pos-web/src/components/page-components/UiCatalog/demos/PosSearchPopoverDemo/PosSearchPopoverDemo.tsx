import { useState } from "react";
import { PosSearchPopover } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

const CUSTOMERS: Customer[] = [
  { id: "1", name: "Trần Thị B", phone: "0901234567" },
  { id: "2", name: "Lê Văn C", phone: "0907654321" },
  { id: "3", name: "Phạm Thị D", phone: "0912345678" },
];

export const PosSearchPopoverDemo = () => {
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<Customer | null>(null);

  return (
    <div className="w-full max-w-sm">
      <PosSearchPopover<Customer>
        value={value}
        onValueChange={setValue}
        search={async (q) => {
          const lower = q.toLowerCase();
          return CUSTOMERS.filter(
            (c) => c.name.toLowerCase().includes(lower) || c.phone.includes(q),
          ).map((item) => ({ item }));
        }}
        onSelect={(c) => {
          setPicked(c);
          setValue(c.name);
        }}
        itemKey={(c) => c.id}
        renderItem={(c) => c.name}
        renderMeta={(c) => c.phone}
        placeholder="Tìm khách hàng (gõ ≥ 2 ký tự)…"
        containerClassName="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 h-9"
        inputClassName="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
        prefix={<SearchIcon size={16} className="text-gray-400" />}
      />
      {picked ? (
        <p className="mt-2 text-[12px] text-gray-500">Đã chọn: {picked.name}</p>
      ) : null}
    </div>
  );
};

export const posSearchPopoverEntry: CatalogEntry = {
  id: "pos-search-popover",
  name: "PosSearchPopover",
  category: "input",
  importPath: "@erp/pos/components/common/PosSearchPopover/PosSearchPopover",
  description:
    "Ô tìm kiếm + popover gợi ý bất đồng bộ. Tự lo debounce, điều hướng bàn phím, đóng khi click ngoài; layout (viền/icon) do consumer truyền vào.",
  props: [
    { name: "value", type: "string", required: true, description: "Giá trị input (controlled)." },
    { name: "onValueChange", type: "(value: string) => void", required: true, description: "Gọi khi gõ." },
    { name: "search", type: "(query: string) => Promise<SearchSuggestion<T>[]>", required: true, description: "Tìm bất đồng bộ — trả gợi ý cho query." },
    { name: "onSelect", type: "(item: T) => void", required: true, description: "Gọi khi chọn 1 gợi ý." },
    { name: "itemKey", type: "(item: T) => string", required: true, description: "Khoá duy nhất." },
    { name: "renderItem", type: "(item: T) => ReactNode", required: true, description: "Render dòng chính." },
    { name: "renderMeta", type: "(item: T) => ReactNode", required: false, description: "Dòng phụ." },
    { name: "onSubmitQuery", type: "(query: string) => boolean | void", required: false, description: "Enter khi chưa highlight; trả true để chặn mặc định." },
    { name: "placeholder", type: "string", required: false, description: "Gợi ý." },
    { name: "inputType", type: "string", required: false, defaultValue: '"search"', description: "type của input." },
    { name: "ariaLabel", type: "string", required: false, description: "Nhãn trợ năng." },
    { name: "disabled", type: "boolean", required: false, description: "Vô hiệu hoá." },
    { name: "minChars", type: "number", required: false, defaultValue: "2", description: "Số ký tự tối thiểu mới tìm." },
    { name: "debounceMs", type: "number", required: false, defaultValue: "300", description: "Độ trễ debounce (ms)." },
    { name: "maxSuggestions", type: "number", required: false, defaultValue: "8", description: "Số gợi ý tối đa." },
    { name: "prefix / suffix", type: "ReactNode", required: false, description: "Slot trước/sau input trong wrapper." },
    { name: "containerClassName", type: "string", required: false, description: "Class cho wrapper viền chứa prefix/input/suffix." },
    { name: "inputClassName", type: "string", required: false, description: "Class cho thẻ input trần." },
    { name: "inputRef", type: "Ref<HTMLInputElement>", required: false, description: "Ref tới input." },
    { name: "emptyAction", type: "{ label: string; onClick: (q: string) => void }", required: false, description: "Nút hành động khi không có kết quả." },
  ],
  usageNotes: [
    "Khác PosSelectSearch: search là async (Promise) và component KHÔNG vẽ viền — bạn tự cấp qua containerClassName + prefix/suffix.",
    "Phù hợp tìm kiếm gọi API (sản phẩm, khách hàng) với debounce sẵn.",
    "Dùng emptyAction để gợi ý 'Tạo mới' khi không thấy kết quả.",
  ],
  code: `const [value, setValue] = useState("");

<PosSearchPopover
  value={value}
  onValueChange={setValue}
  search={async (q) => (await api.search(q)).map((item) => ({ item }))}
  onSelect={(c) => setValue(c.name)}
  itemKey={(c) => c.id}
  renderItem={(c) => c.name}
  renderMeta={(c) => c.phone}
  placeholder="Tìm khách hàng…"
  containerClassName="flex items-center gap-2 rounded-md border px-3 h-9"
  inputClassName="flex-1 bg-transparent focus:outline-none"
/>`,
  Demo: PosSearchPopoverDemo,
};
