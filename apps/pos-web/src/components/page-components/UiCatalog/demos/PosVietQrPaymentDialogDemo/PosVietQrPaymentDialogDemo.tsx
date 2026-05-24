import { useState } from "react";
import { PosVietQrPaymentDialog } from "@erp/pos/components/common/PosVietQrPaymentDialog/PosVietQrPaymentDialog";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

const TRIGGER_CLASS =
  "inline-flex h-9 items-center rounded-md bg-[#2E7D32] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#256628]";

export const PosVietQrPaymentDialogDemo = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={TRIGGER_CLASS} onClick={() => setOpen(true)}>
        Mở mã VietQR
      </button>
      <PosVietQrPaymentDialog
        open={open}
        onClose={() => setOpen(false)}
        payment={{
          holderName: "CONG TY TNHH JACK ERP",
          accountNumber: "0123456789",
          bankCode: "VCB",
          amount: 185000,
          note: "Thanh toan hoa don POS-001",
        }}
      />
    </>
  );
};

export const posVietQrPaymentDialogEntry: CatalogEntry = {
  id: "pos-viet-qr-payment-dialog",
  name: "PosVietQrPaymentDialog",
  category: "overlay",
  importPath: "@erp/pos/components/common/PosVietQrPaymentDialog/PosVietQrPaymentDialog",
  description:
    "Modal thanh toán VietQR: thẻ trang trí + mã QR sinh từ thông tin tài khoản, kèm nút “In mã QR” (in riêng phần QR qua iframe ẩn).",
  props: [
    { name: "open", type: "boolean", required: true, description: "Đang mở hay không." },
    { name: "onClose", type: "() => void", required: true, description: "Gọi khi đóng." },
    { name: "payment", type: "QrPaymentInfo", required: true, description: "Thông tin tài khoản: holderName, accountNumber, bankCode, amount?, note?." },
  ],
  usageNotes: [
    "payment.amount và payment.note (nếu có) được mã hoá vào payload QR.",
    "Nút “In mã QR” chỉ in phần thẻ QR — phần còn lại của trang không lên giấy.",
    "Mã QR hiện tại là payload đại diện; thay bằng VietQR thật khi nối service.",
  ],
  code: `const [open, setOpen] = useState(false);

<PosVietQrPaymentDialog
  open={open}
  onClose={() => setOpen(false)}
  payment={{
    holderName: "CONG TY TNHH JACK ERP",
    accountNumber: "0123456789",
    bankCode: "VCB",
    amount: 185000,
  }}
/>`,
  Demo: PosVietQrPaymentDialogDemo,
};
