import { DepositMovementType, ReconStatus } from "@erp/shared-interfaces";
import { DepositReconBatchStatus } from "./deposit-recon.types";

export const RECON_STATUS_LABEL: Record<ReconStatus, string> = {
  [ReconStatus.CHUA]: "Chưa đối chiếu",
  [ReconStatus.DA]: "Đã đối chiếu",
  [ReconStatus.LECH]: "Lệch",
};

export const RECON_STATUS_FILTER_OPTIONS = Object.values(ReconStatus).map((value) => ({
  value,
  label: RECON_STATUS_LABEL[value],
}));

export const DEPOSIT_MOVEMENT_TYPE_LABEL: Record<DepositMovementType, string> = {
  [DepositMovementType.DEPOSIT]: "Tiền vào",
  [DepositMovementType.WITHDRAWAL]: "Tiền ra",
  [DepositMovementType.TRANSFER]: "Chuyển khoản nội bộ",
  [DepositMovementType.ADJUSTMENT]: "Điều chỉnh",
};

export const DEPOSIT_MOVEMENT_TYPE_FILTER_OPTIONS = Object.values(DepositMovementType).map(
  (value) => ({ value, label: DEPOSIT_MOVEMENT_TYPE_LABEL[value] }),
);

export const RECON_BATCH_STATUS_LABEL: Record<DepositReconBatchStatus, string> = {
  [DepositReconBatchStatus.RECONCILED]: "Khớp",
  [DepositReconBatchStatus.DISCREPANCY]: "Lệch",
};
