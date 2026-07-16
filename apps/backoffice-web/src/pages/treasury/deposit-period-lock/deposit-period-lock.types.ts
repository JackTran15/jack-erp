/**
 * Hand-rolled mirror of the deposit-period-lock backend DTOs/entity — same
 * convention as `bank-vouchers.types.ts` (the generated `@erp/api-client`
 * schema types aren't wired into the `erpApi` wrapper).
 */

export enum DepositPeriodLockStatus {
  LOCKED = "LOCKED",
  UNLOCKED = "UNLOCKED",
}

/** Per-account closing balance recorded when a period is locked (BR-LOCK-03). */
export interface PeriodClosingBalanceSnapshot {
  depositAccountId: string;
  closingBalance: number;
  bookBalance: number;
  availableBalance: number;
}

export interface DepositPeriodLock {
  id: string;
  organizationId: string;
  branchId: string;
  /** YYYY-MM */
  period: string;
  status: DepositPeriodLockStatus;
  closingBalanceSnapshot: PeriodClosingBalanceSnapshot[];
  lockedBy: string;
  lockedAt: string;
  unlockedBy?: string | null;
  unlockedAt?: string | null;
  unlockReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LockPeriodBody {
  branchId: string;
  /** YYYY-MM */
  period: string;
  /** Overrides the BR-REC-04 stale-unreconciled warning. */
  force?: boolean;
}

export interface UnlockPeriodBody {
  reason: string;
}
