import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositPeriodGuardService } from './deposit-period-guard.service';
import { DepositPeriodLockStatus } from './deposit-period-lock.entity';

function buildDataSource(found: any) {
  const repo = { findOne: jest.fn().mockResolvedValue(found) };
  const manager = { getRepository: jest.fn().mockReturnValue(repo) };
  return { dataSource: { manager } as unknown as DataSource, repo };
}

describe('DepositPeriodGuardService.assertNotLocked', () => {
  it('throws ConflictException when the period is LOCKED', async () => {
    const { dataSource, repo } = buildDataSource({
      id: 'lock-1',
      status: DepositPeriodLockStatus.LOCKED,
    });
    const service = new DepositPeriodGuardService(dataSource);

    await expect(service.assertNotLocked('branch-1', '2026-06-15')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { branchId: 'branch-1', period: '2026-06', status: DepositPeriodLockStatus.LOCKED },
    });
  });

  it('resolves when no lock exists for the period', async () => {
    const { dataSource } = buildDataSource(null);
    const service = new DepositPeriodGuardService(dataSource);
    await expect(service.assertNotLocked('branch-1', '2026-06-15')).resolves.toBeUndefined();
  });
});
