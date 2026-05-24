import { useState } from "react";
import {
  PosPaymentMethodList,
  createPaymentLine,
  type PaymentLine,
} from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import type { PaymentAccountRow } from "@erp/pos/interfaces/account.interface";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

const ACCOUNTS: PaymentAccountRow[] = [
  { id: "acc-cash", paymentMethod: "cash", label: "Tiền mặt", bankName: null, bankCode: null, accountNumber: null, sortOrder: 0 },
  { id: "acc-vcb", paymentMethod: "bank_transfer", label: null, bankName: "Vietcombank", bankCode: "VCB", accountNumber: "0123456789", sortOrder: 1 },
  { id: "acc-tcb", paymentMethod: "bank_transfer", label: null, bankName: "Techcombank", bankCode: "TCB", accountNumber: "0987654321", sortOrder: 2 },
];

export const PosPaymentMethodRowDemo = () => {
  const [lines, setLines] = useState<PaymentLine[]>(() => [
    createPaymentLine(PaymentMethodEnum.CASH, 185000, "acc-cash"),
  ]);

  return (
    <div className="w-full max-w-sm">
      <PosPaymentMethodList lines={lines} accounts={ACCOUNTS} onChange={setLines} />
    </div>
  );
};

export const posPaymentMethodRowEntry: CatalogEntry = {
  id: "pos-payment-method-row",
  name: "PosPaymentMethodRow / List",
  category: "domain",
  importPath: "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow",
  description:
    "Dòng phương thức thanh toán (chọn tài khoản tiền + nhập số tiền). PosPaymentMethodList điều phối nhiều dòng: thêm/xoá và tự khoá tài khoản đã dùng ở dòng khác.",
  props: [
    { name: "[List] lines", type: "PaymentLine[]", required: true, description: "Mảng dòng thanh toán (host là nguồn sự thật)." },
    { name: "[List] accounts", type: "readonly PaymentAccountRow[]", required: true, description: "Danh sách tài khoản nhận tiền đã cấu hình (payment_accounts)." },
    { name: "[List] onChange", type: "(lines: PaymentLine[]) => void", required: true, description: "Gọi khi mảng dòng thay đổi." },
    { name: "[List] amountReadOnly", type: "(line, index) => boolean", required: false, description: "Khoá ô số tiền theo từng dòng." },
    { name: "[List] amountInputRef", type: "Ref<HTMLInputElement>", required: false, description: "Ref tới ô số tiền của dòng đầu (focus phím tắt)." },
    { name: "[Row] line", type: "PaymentLine", required: true, description: "Dữ liệu dòng: { id, method, paymentAccountId, amount }." },
    { name: "[Row] variant", type: '"add" | "remove"', required: true, description: "Icon đầu dòng: thêm (+) hay xoá (×)." },
    { name: "[Row] onChangeAccount / onChangeAmount", type: "(…) => void", required: true, description: "Cập nhật tài khoản / số tiền của dòng." },
    { name: "[Row] unavailableAccountIds", type: "ReadonlyArray<string>", required: false, description: "Các tài khoản bị khoá (đã dùng ở dòng khác)." },
  ],
  usageNotes: [
    "Thường dùng PosPaymentMethodList (orchestrator); PosPaymentMethodRow là dòng lẻ.",
    "Dùng createPaymentLine(method, amount?, paymentAccountId?) để khởi tạo dòng mới.",
    "Tài khoản đã chọn ở dòng khác sẽ bị disable; hết tài khoản thì nút thêm tự ẩn.",
  ],
  code: `const [lines, setLines] = useState<PaymentLine[]>(() => [
  createPaymentLine(PaymentMethodEnum.CASH, 185000, "acc-cash"),
]);

<PosPaymentMethodList lines={lines} accounts={accounts} onChange={setLines} />`,
  Demo: PosPaymentMethodRowDemo,
};
