import type { ComponentType } from "react";
import {
  ArrowLeftIcon,
  BarcodeIcon,
  BellIcon,
  CalendarIcon,
  CartIcon,
  ChevronDownIcon,
  CloseIcon,
  FileTextIcon,
  FilterIcon,
  GearIcon,
  GiftIcon,
  GridIcon,
  InfoCircleIcon,
  type IconProps,
  MapPinIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  QrIcon,
  ReceiptIcon,
  RefreshIcon,
  SearchIcon,
  TagIcon,
  TruckIcon,
  UserIcon,
  UserPlusIcon,
  WarningIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

const ICONS: ReadonlyArray<[string, ComponentType<IconProps>]> = [
  ["PlusIcon", PlusIcon],
  ["MinusIcon", MinusIcon],
  ["CloseIcon", CloseIcon],
  ["SearchIcon", SearchIcon],
  ["ChevronDownIcon", ChevronDownIcon],
  ["ArrowLeftIcon", ArrowLeftIcon],
  ["CartIcon", CartIcon],
  ["ReceiptIcon", ReceiptIcon],
  ["UserIcon", UserIcon],
  ["UserPlusIcon", UserPlusIcon],
  ["TagIcon", TagIcon],
  ["GiftIcon", GiftIcon],
  ["TruckIcon", TruckIcon],
  ["PrinterIcon", PrinterIcon],
  ["QrIcon", QrIcon],
  ["BarcodeIcon", BarcodeIcon],
  ["FilterIcon", FilterIcon],
  ["GridIcon", GridIcon],
  ["FileTextIcon", FileTextIcon],
  ["CalendarIcon", CalendarIcon],
  ["MapPinIcon", MapPinIcon],
  ["BellIcon", BellIcon],
  ["GearIcon", GearIcon],
  ["RefreshIcon", RefreshIcon],
  ["PencilIcon", PencilIcon],
  ["InfoCircleIcon", InfoCircleIcon],
  ["WarningIcon", WarningIcon],
];

export const PosIconsDemo = () => {
  return (
    <div className="grid w-full grid-cols-3 gap-3 sm:grid-cols-4">
      {ICONS.map(([name, Icon]) => (
        <div
          key={name}
          className="flex flex-col items-center gap-1.5 rounded-md border border-gray-100 bg-white px-2 py-3"
        >
          <Icon size={22} className="text-gray-700" />
          <span className="truncate text-[10px] text-gray-400">{name}</span>
        </div>
      ))}
    </div>
  );
};

export const posIconsEntry: CatalogEntry = {
  id: "pos-icons",
  name: "PosIcons",
  category: "display",
  importPath: "@erp/pos/components/common/PosIcons/PosIcons",
  description:
    "Bộ icon SVG inline kiểu outline (stroke 1.5px), tự chứa không phụ thuộc thư viện ngoài. Mỗi icon là một hàm nhận size + thuộc tính SVG. Bản demo chỉ hiển thị một phần — file có 50+ icon.",
  props: [
    { name: "size", type: "number | string", required: false, defaultValue: "16", description: "Cạnh icon (px)." },
    { name: "strokeWidth", type: "number | string", required: false, defaultValue: "1.5", description: "Độ dày nét (kế thừa SVGProps)." },
    { name: "className", type: "string", required: false, description: "Class — màu icon theo currentColor nên dùng text-* để đổi màu." },
    { name: "...props", type: "SVGProps<SVGSVGElement>", required: false, description: "Mọi thuộc tính SVG còn lại được truyền thẳng." },
  ],
  usageNotes: [
    "Màu icon dùng currentColor — đổi màu bằng class text-* trên icon hoặc phần tử cha.",
    "Import trực tiếp từng icon theo tên (named export), không có index.ts.",
    "Cần icon mới thì thêm vào PosIcons.tsx (đây là bộ icon nội bộ của POS).",
  ],
  code: `import { SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

<SearchIcon size={16} className="text-gray-400" />`,
  Demo: PosIconsDemo,
};
