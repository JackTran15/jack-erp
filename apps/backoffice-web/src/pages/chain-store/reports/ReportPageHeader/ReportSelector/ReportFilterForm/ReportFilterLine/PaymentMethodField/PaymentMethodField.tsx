import { CASH_FUND_KIND_LABELS_VI, type CashFundKind } from "@erp/shared-interfaces";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  value: CashFundKind | "";
  onChange: (value: CashFundKind | "") => void;
}

// "Phương thức thanh toán" của báo cáo quỹ tiền — select tĩnh Tất cả / Tiền mặt /
// Chuyển khoản (A-05). Cùng nhãn với BE filter-options type=paymentMethod nhưng
// không gọi API: 2 giá trị cố định theo bảng nguồn (cash_* / bank_*).
const PAYMENT_METHOD_OPTIONS = (
  Object.keys(CASH_FUND_KIND_LABELS_VI) as CashFundKind[]
).map((kind) => ({ value: kind, label: CASH_FUND_KIND_LABELS_VI[kind] }));

export function PaymentMethodField({ value, onChange }: Props) {
  return (
    <ReportSelectField
      value={value}
      options={PAYMENT_METHOD_OPTIONS}
      placeholder="Tất cả"
      onChange={(v) => onChange(v as CashFundKind | "")}
    />
  );
}
