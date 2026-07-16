import { DepositTransferStatus } from "@erp/shared-interfaces";

export const DEPOSIT_TRANSFER_STATUS_LABEL: Record<DepositTransferStatus, string> = {
  [DepositTransferStatus.DANG_CHUYEN]: "Đang chuyển",
  [DepositTransferStatus.HOAN_TAT]: "Hoàn tất",
  [DepositTransferStatus.DA_HUY]: "Đã hủy",
};

export const DEPOSIT_TRANSFER_STATUS_FILTER_OPTIONS = Object.values(DepositTransferStatus).map(
  (value) => ({ value, label: DEPOSIT_TRANSFER_STATUS_LABEL[value] }),
);
