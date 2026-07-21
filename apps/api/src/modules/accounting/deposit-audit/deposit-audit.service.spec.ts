import { DepositAuditService } from './deposit-audit.service';
import { DepositAuditAction, DepositAuditEntityType } from './deposit-audit-log.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

describe('DepositAuditService', () => {
  describe('record', () => {
    it('writes via the injected repo when no manager is given', async () => {
      const repo = {
        create: jest.fn((d: any) => d),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const service = new DepositAuditService(repo as any);

      await service.record(
        {
          entityType: DepositAuditEntityType.RECON_BATCH,
          entityId: 'batch-1',
          action: DepositAuditAction.RECONCILE,
          after: { id: 'batch-1' },
        },
        actor,
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          branchId: 'branch-1',
          entityType: DepositAuditEntityType.RECON_BATCH,
          entityId: 'batch-1',
          action: DepositAuditAction.RECONCILE,
          actorId: 'user-1',
        }),
      );
    });

    it('writes via the caller-supplied manager when given (same transaction)', async () => {
      const txRepo = { create: jest.fn((d: any) => d), save: jest.fn().mockResolvedValue(undefined) };
      const manager = { getRepository: jest.fn().mockReturnValue(txRepo) };
      const repo = { create: jest.fn(), save: jest.fn() };
      const service = new DepositAuditService(repo as any);

      await service.record(
        {
          entityType: DepositAuditEntityType.PERIOD_LOCK,
          entityId: 'lock-1',
          action: DepositAuditAction.LOCK_PERIOD,
        },
        actor,
        manager as any,
      );

      expect(txRepo.save).toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('scopes by organizationId and branchId (BR-PERM-01)', async () => {
      const qb: any = {
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        skip: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const repo = { createQueryBuilder: jest.fn(() => qb) };
      const service = new DepositAuditService(repo as any);

      await service.list({}, actor);

      expect(qb.where).toHaveBeenCalledWith('a.organizationId = :org', { org: 'org-1' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(a.branchId = :branch OR a.branchId IS NULL)',
        { branch: 'branch-1' },
      );
    });
  });
});
