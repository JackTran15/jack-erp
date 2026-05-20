import { useState } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

const TRIGGER_CLASS =
  "inline-flex h-9 items-center rounded-md bg-[#1a73e8] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1557b0]";

export const PosDialogDemo = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={TRIGGER_CLASS} onClick={() => setOpen(true)}>
        Mở hộp thoại
      </button>
      <PosDialog open={open} onClose={() => setOpen(false)} width={480}>
        <PosDialog.Header title="Xác nhận thao tác" />
        <PosDialog.Body>
          <p className="text-[14px] leading-relaxed text-gray-700">
            Đây là nội dung hộp thoại. Bạn có chắc muốn tiếp tục không?
          </p>
        </PosDialog.Body>
        <PosDialog.Footer
          onCancel={() => setOpen(false)}
          onSave={() => setOpen(false)}
          saveLabel="Đồng ý"
          cancelLabel="Huỷ"
        />
      </PosDialog>
    </>
  );
};

export const posDialogEntry: CatalogEntry = {
  id: "pos-dialog",
  name: "PosDialog",
  category: "overlay",
  importPath: "@erp/pos/components/common/PosDialog/PosDialog",
  description:
    "Hộp thoại modal (canh giữa) có thể truy cập, kèm 3 phần con Header/Body/Footer. Quản lý focus khi mở/đóng và hỗ trợ submit form qua nút Footer.",
  props: [
    { name: "open", type: "boolean", required: true, description: "Đang mở hay không." },
    { name: "onClose", type: "() => void", required: true, description: "Gọi khi yêu cầu đóng (ESC, overlay…)." },
    { name: "children", type: "ReactNode", required: true, description: "Nội dung — thường là Header/Body/Footer." },
    { name: "width", type: "number", required: false, defaultValue: "880", description: "Chiều rộng tối đa (px)." },
    { name: "contentClassName / contentStyle", type: "string / CSSProperties", required: false, description: "Tuỳ biến class/style cho khung nội dung." },
    { name: "ariaLabelledBy / ariaDescribedBy", type: "string", required: false, description: "Liên kết nhãn/mô tả trợ năng." },
    { name: "returnFocusTo", type: "RefObject<HTMLElement | null>", required: false, description: "Phần tử nhận focus khi đóng." },
    { name: "initialFocusRef", type: "RefObject<HTMLElement | null>", required: false, description: "Phần tử nhận focus khi mở (input/textarea sẽ được select)." },
  ],
  usageNotes: [
    "Compound component: PosDialog.Header / PosDialog.Body / PosDialog.Footer.",
    "Footer: truyền onSave để hiện nút chính; hoặc saveFormId để submit <form> bằng phím Enter.",
    "Dùng initialFocusRef để focus thẳng vào ô nhập chính của form.",
  ],
  code: `const [open, setOpen] = useState(false);

<PosDialog open={open} onClose={() => setOpen(false)} width={480}>
  <PosDialog.Header title="Xác nhận thao tác" />
  <PosDialog.Body>Bạn có chắc muốn tiếp tục?</PosDialog.Body>
  <PosDialog.Footer
    onCancel={() => setOpen(false)}
    onSave={() => setOpen(false)}
    saveLabel="Đồng ý"
  />
</PosDialog>`,
  Demo: PosDialogDemo,
};
