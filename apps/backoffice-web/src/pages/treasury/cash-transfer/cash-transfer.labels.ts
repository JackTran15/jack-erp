import { DepositTransferStatus } from "@erp/shared-interfaces";
import { CashTransferFundKind } from "../cash-vouchers.types";

export const CASH_TRANSFER_STATUS_LABEL: Record<DepositTransferStatus, string> = {
  [DepositTransferStatus.DANG_CHUYEN]: "Đang chuyển",
  [DepositTransferStatus.HOAN_TAT]: "Hoàn tất",
  [DepositTransferStatus.DA_HUY]: "Đã hủy",
};

export const CASH_TRANSFER_STATUS_FILTER_OPTIONS = Object.values(DepositTransferStatus).map(
  (value) => ({ value, label: CASH_TRANSFER_STATUS_LABEL[value] }),
);

export const CASH_TRANSFER_FUND_KIND_LABEL: Record<CashTransferFundKind, string> = {
  [CashTransferFundKind.CASH]: "Tiền mặt",
  [CashTransferFundKind.DEPOSIT]: "Tiền gửi",
};
