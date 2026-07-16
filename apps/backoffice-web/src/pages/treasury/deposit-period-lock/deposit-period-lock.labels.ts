import { DepositPeriodLockStatus } from "./deposit-period-lock.types";

export const DEPOSIT_PERIOD_LOCK_STATUS_LABEL: Record<DepositPeriodLockStatus, string> = {
  [DepositPeriodLockStatus.LOCKED]: "Đã khóa",
  [DepositPeriodLockStatus.UNLOCKED]: "Đã mở",
};
