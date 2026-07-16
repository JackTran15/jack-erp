import { BankVoucherStatus } from "./bank-vouchers.types";

export const BANK_VOUCHER_STATUS_LABEL: Record<BankVoucherStatus, string> = {
  [BankVoucherStatus.DRAFT]: "Nháp",
  [BankVoucherStatus.PENDING_APPROVAL]: "Chờ duyệt",
  [BankVoucherStatus.POSTED]: "Đã ghi sổ",
  [BankVoucherStatus.REVERSED]: "Đã đảo",
};
