import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DepositPeriodLockEntity, DepositPeriodLockStatus } from './deposit-period-lock.entity';

/** 'YYYY-MM-DD' → 'YYYY-MM'. */
export function toYearMonth(docDate: string): string {
  return docDate.slice(0, 7);
}

/**
 * BR-LOCK-01 guard: blocks any mutation whose `doc_date` falls in a LOCKED
 * period. Reused by TKT-DFR-05 (refund/cancel reversal) and the GĐ2 spending
 * voucher post/reverse paths.
 */
@Injectable()
export class DepositPeriodGuardService {
  constructor(private readonly dataSource: DataSource) {}

  async assertNotLocked(
    branchId: string,
    docDate: string,
    manager?: EntityManager,
  ): Promise<void> {
    const period = toYearMonth(docDate);
    const repo = (manager ?? this.dataSource.manager).getRepository(DepositPeriodLockEntity);
    const locked = await repo.findOne({
      where: { branchId, period, status: DepositPeriodLockStatus.LOCKED },
    });
    if (locked) {
      throw new ConflictException(
        `Period ${period} is locked for this branch (BR-LOCK-01)`,
      );
    }
  }
}
