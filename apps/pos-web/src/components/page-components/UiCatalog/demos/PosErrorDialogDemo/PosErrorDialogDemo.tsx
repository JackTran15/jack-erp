import { useState } from "react";
import { PosErrorDialog } from "@erp/pos/components/common/PosErrorDialog/PosErrorDialog";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

const TRIGGER_CLASS =
  "inline-flex h-9 items-center rounded-md border border-[#EF4444] px-4 text-[13px] font-medium text-[#EF4444] transition-colors hover:bg-[#FEE2E2]";

export const PosErrorDialogDemo = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={TRIGGER_CLASS} onClick={() => setOpen(true)}>
        Hiện cảnh báo
      </button>
      <PosErrorDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Không thể tạo hoá đơn"
        message="Số lượng tồn kho không đủ để bán mặt hàng này."
      />
    </>
  );
};

export const posErrorDialogEntry: CatalogEntry = {
  id: "pos-error-dialog",
  name: "PosErrorDialog",
  category: "overlay",
  importPath: "@erp/pos/components/common/PosErrorDialog/PosErrorDialog",
  description:
    "Hộp thoại cảnh báo lỗi (dựng trên PosDialog) với icon cấm đỏ, tiêu đề, nội dung và nút đóng.",
  props: [
    { name: "open", type: "boolean", required: true, description: "Đang mở hay không." },
    { name: "onClose", type: "() => void", required: true, description: "Gọi khi đóng." },
    { name: "title", type: "string", required: false, defaultValue: '"Cảnh báo"', description: "Tiêu đề hộp thoại." },
    { name: "dismissLabel", type: "string", required: false, defaultValue: '"Đóng"', description: "Nhãn nút đóng." },
    { name: "width", type: "number", required: false, defaultValue: "425", description: "Chiều rộng (px)." },
    { name: "message", type: "string", required: false, description: "Nội dung lỗi (dùng khi không truyền children)." },
    { name: "children", type: "ReactNode", required: false, description: "Nội dung tuỳ biến, ưu tiên hơn message." },
  ],
  usageNotes: [
    "Truyền message cho thông báo đơn giản; dùng children khi cần bố cục phức tạp.",
    "Chỉ có nút đóng — đây là dialog thông báo, không phải xác nhận.",
  ],
  code: `const [open, setOpen] = useState(false);

<PosErrorDialog
  open={open}
  onClose={() => setOpen(false)}
  title="Không thể tạo hoá đơn"
  message="Số lượng tồn kho không đủ."
/>`,
  Demo: PosErrorDialogDemo,
};
