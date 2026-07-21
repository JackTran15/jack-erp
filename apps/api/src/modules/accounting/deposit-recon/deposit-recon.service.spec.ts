import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReconStatus } from '@erp/shared-interfaces';
import { DepositReconService } from './deposit-recon.service';
import { DepositReconBatchEntity, DepositReconBatchStatus } from './deposit-recon-batch.entity';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { CashFundResolverService } from '../cash/cash-fund-resolver.service';
import { CashVoucherCategoryResolverService } from '../cash-vouchers/shared/category-resolver.service';
import { BankPaymentsService } from '../deposit-vouchers/bank-payments/bank-payments.service';
import { DepositAuditService } from '../deposit-audit/deposit-audit.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

function buildManager(movements: any[]) {
  let idCounter = 0;
  const manager: any = {
    getRepository: jest.fn((entity: any) => {
      if (entity === DepositMovementEntity) {
        return {
          // The lock query is filtered the way the DB would filter it (ids +
          // account + CHUA), so a multi-group call sees only its own rows.
          createQueryBuilder: jest.fn(() => {
            const params: Record<string, any> = {};
            const qb: any = {
              setLock: jest.fn(() => qb),
              where: jest.fn((_sql: string, p?: any) => {
                Object.assign(params, p);
                return qb;
              }),
              andWhere: jest.fn((_sql: string, p?: any) => {
                Object.assign(params, p);
                return qb;
              }),
              getMany: jest.fn(async () =>
                movements.filter(
                  (m) =>
                    (params.ids as string[]).includes(m.id) &&
                    m.depositAccountId === params.acc &&
                    m.reconStatus === params.status,
                ),
              ),
            };
            return qb;
          }),
          find: jest.fn(async () => movements),
          update: jest.fn(async (crit: any, patch: any) => {
            const ids: string[] = crit.id?.value ?? [];
            const target = movements.filter((m) => ids.includes(m.id));
            for (const m of target) Object.assign(m, patch);
            return { affected: target.length };
          }),
        };
      }
      if (entity === DepositReconBatchEntity) {
        return {
          create: jest.fn((data: any) => ({ id: `batch-${++idCounter}`, ...data })),
          save: jest.fn(async (e: any) => e),
        };
      }
      return { create: jest.fn((d: any) => d), save: jest.fn(async (e: any) => e) };
    }),
    create: jest.fn((_e: any, data: any) => ({ id: data.id ?? `gen-${++idCounter}`, ...data })),
    save: jest.fn(async (e: any) => e),
  };
  return manager;
}

async function setup(manager: any) {
  const dataSource = { transaction: jest.fn((cb) => cb(manager)), manager };
  let docSeq = 0;
  const docNumbering = { generate: jest.fn(async () => `DS-26-0000${++docSeq}`) };
  const cashFundResolver = { resolveCoaAccountIdByCode: jest.fn().mockResolvedValue('acc-6417') };
  const categoryResolver = { resolveId: jest.fn().mockResolvedValue('cat-bank-fee') };
  const bankPayment = {
    createDraftInternal: jest.fn().mockResolvedValue({ voucherId: 'draft-bp-1' }),
  };
  const auditService = { record: jest.fn().mockResolvedValue(undefined) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DepositReconService,
      { provide: getRepositoryToken(DepositMovementEntity), useValue: {} },
      { provide: getRepositoryToken(DepositReconBatchEntity), useValue: {} },
      { provide: DataSource, useValue: dataSource },
      { provide: DocumentNumberingService, useValue: docNumbering },
      { provide: CashFundResolverService, useValue: cashFundResolver },
      { provide: CashVoucherCategoryResolverService, useValue: categoryResolver },
      { provide: BankPaymentsService, useValue: bankPayment },
      { provide: DepositAuditService, useValue: auditService },
    ],
  }).compile();

  return {
    service: module.get(DepositReconService),
    bankPayment,
    docNumbering,
    auditService,
  };
}

function movement(over: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    depositAccountId: 'dep-1',
    netAmount: 1_122_515,
    amount: 1_135_000,
    reconStatus: ReconStatus.CHUA as string,
    reconBatchId: undefined as string | null | undefined,
    ...over,
  };
}

describe('DepositReconService', () => {
  describe('reconcile', () => {
    const dates = { stmtFromDate: '2026-07-01', stmtToDate: '2026-07-15' };

    it('diff=0: sets DA + batch RECONCILED, using net_amount (not gross amount)', async () => {
      const mv = movement();
      const manager = buildManager([mv]);
      const { service, bankPayment } = await setup(manager);

      const { results } = await service.reconcile(
        {
          ...dates,
          groups: [
            {
              depositAccountId: 'dep-1',
              movementIds: ['mv-1'],
              stmtTotalAmount: 1_122_515,
            },
          ],
        },
        actor,
      );

      expect(results).toHaveLength(1);
      expect(results[0].systemTotalAmount).toBe(1_122_515);
      expect(results[0].diffAmount).toBe(0);
      expect(results[0].status).toBe(DepositReconBatchStatus.RECONCILED);
      expect(mv.reconStatus).toBe(ReconStatus.DA);
      expect(mv.reconBatchId).toBeDefined();
      expect(bankPayment.createDraftInternal).not.toHaveBeenCalled();
    });

    it('diff!=0 with note: sets LECH + batch DISCREPANCY + proposes a fee-adjustment DRAFT (no balance change)', async () => {
      const mv = movement();
      const manager = buildManager([mv]);
      const { service, bankPayment } = await setup(manager);

      const { results } = await service.reconcile(
        {
          ...dates,
          groups: [
            {
              depositAccountId: 'dep-1',
              movementIds: ['mv-1'],
              stmtTotalAmount: 1_110_030,
              note: 'Chênh lệch phí thực tế',
            },
          ],
        },
        actor,
      );

      expect(results[0].diffAmount).toBe(-12_485);
      expect(results[0].status).toBe(DepositReconBatchStatus.DISCREPANCY);
      expect(mv.reconStatus).toBe(ReconStatus.LECH);
      expect(bankPayment.createDraftInternal).toHaveBeenCalledTimes(1);
      expect(results[0].proposalId).toBe('draft-bp-1');
    });

    it('diff!=0 without note: rejects with 400 (BR-REC-02)', async () => {
      const manager = buildManager([movement()]);
      const { service } = await setup(manager);

      await expect(
        service.reconcile(
          {
            ...dates,
            groups: [
              {
                depositAccountId: 'dep-1',
                movementIds: ['mv-1'],
                stmtTotalAmount: 1_110_030,
              },
            ],
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('double-reconcile: a movement no longer CHUA is excluded from the lock query result → 400', async () => {
      // Simulate the FOR UPDATE query returning fewer rows than requested
      // (the other movement is already DA/LECH and filtered out server-side).
      const manager = buildManager([movement()]);
      const { service } = await setup(manager);

      await expect(
        service.reconcile(
          {
            ...dates,
            groups: [
              {
                depositAccountId: 'dep-1',
                movementIds: ['mv-1', 'mv-2'],
                stmtTotalAmount: 1_122_515,
              },
            ],
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('two accounts: one batch each, only the discrepancy group proposes a fee adjustment', async () => {
      const a = movement({ id: 'mv-a', depositAccountId: 'dep-1' });
      const b = movement({ id: 'mv-b', depositAccountId: 'dep-2', netAmount: 500_000 });
      const manager = buildManager([a, b]);
      const { service, bankPayment } = await setup(manager);

      const { results } = await service.reconcile(
        {
          ...dates,
          groups: [
            {
              depositAccountId: 'dep-1',
              movementIds: ['mv-a'],
              stmtTotalAmount: 1_122_515,
            },
            {
              depositAccountId: 'dep-2',
              movementIds: ['mv-b'],
              stmtTotalAmount: 499_000,
              note: 'Phí chuyển khoản chưa hạch toán',
            },
          ],
        },
        actor,
      );

      expect(results).toHaveLength(2);
      expect(results[0].batch.depositAccountId).toBe('dep-1');
      expect(results[1].batch.depositAccountId).toBe('dep-2');
      expect(results[0].batch.batchNumber).not.toBe(results[1].batch.batchNumber);
      expect(results[0].status).toBe(DepositReconBatchStatus.RECONCILED);
      expect(results[1].status).toBe(DepositReconBatchStatus.DISCREPANCY);
      expect(a.reconStatus).toBe(ReconStatus.DA);
      expect(b.reconStatus).toBe(ReconStatus.LECH);
      expect(a.reconBatchId).not.toBe(b.reconBatchId);
      expect(bankPayment.createDraftInternal).toHaveBeenCalledTimes(1);
    });

    it('a movement listed in two groups: rejects with 400 before any batch is written', async () => {
      const manager = buildManager([movement()]);
      const { service, docNumbering } = await setup(manager);

      await expect(
        service.reconcile(
          {
            ...dates,
            groups: [
              { depositAccountId: 'dep-1', movementIds: ['mv-1'], stmtTotalAmount: 1 },
              { depositAccountId: 'dep-2', movementIds: ['mv-1'], stmtTotalAmount: 1 },
            ],
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(docNumbering.generate).not.toHaveBeenCalled();
    });

    it('the same deposit account in two groups: rejects with 400', async () => {
      const manager = buildManager([movement()]);
      const { service } = await setup(manager);

      await expect(
        service.reconcile(
          {
            ...dates,
            groups: [
              { depositAccountId: 'dep-1', movementIds: ['mv-1'], stmtTotalAmount: 1 },
              { depositAccountId: 'dep-1', movementIds: ['mv-2'], stmtTotalAmount: 1 },
            ],
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a later group failing BR-REC-02 aborts the whole call (single transaction → rollback)', async () => {
      const a = movement({ id: 'mv-a', depositAccountId: 'dep-1' });
      const b = movement({ id: 'mv-b', depositAccountId: 'dep-2', netAmount: 500_000 });
      const manager = buildManager([a, b]);
      const { service } = await setup(manager);

      await expect(
        service.reconcile(
          {
            ...dates,
            groups: [
              {
                depositAccountId: 'dep-1',
                movementIds: ['mv-a'],
                stmtTotalAmount: 1_122_515,
              },
              // Discrepancy without a note — throws inside the transaction, so
              // the batch already written for dep-1 is rolled back by Postgres.
              {
                depositAccountId: 'dep-2',
                movementIds: ['mv-b'],
                stmtTotalAmount: 499_000,
              },
            ],
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(b.reconStatus).toBe(ReconStatus.CHUA);
    });
  });

  describe('assertNotReconciled', () => {
    it('throws ConflictException when the movement is DA or LECH', async () => {
      const manager = { getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(movement({ reconStatus: ReconStatus.DA })) })) };
      const { service } = await setup(buildManager([]));
      await expect(service.assertNotReconciled('mv-1', manager as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('passes when the movement is still CHUA', async () => {
      const manager = { getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(movement({ reconStatus: ReconStatus.CHUA })) })) };
      const { service } = await setup(buildManager([]));
      await expect(service.assertNotReconciled('mv-1', manager as any)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when the movement does not exist', async () => {
      const manager = { getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) })) };
      const { service } = await setup(buildManager([]));
      await expect(service.assertNotReconciled('mv-missing', manager as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('unreconcile', () => {
    it('resets movements to CHUA, clears batch link, and records an audit row', async () => {
      const mv = movement({ reconStatus: ReconStatus.DA, reconBatchId: 'batch-1' });
      const manager = buildManager([mv]);
      const { service, auditService } = await setup(manager);

      const result = await service.unreconcile(
        { movementIds: ['mv-1'], reason: 'Sao kê nhập sai' },
        actor,
      );

      expect(result.updated).toBe(1);
      expect(mv.reconStatus).toBe(ReconStatus.CHUA);
      expect(mv.reconBatchId).toBeNull();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UNRECONCILE', reason: 'Sao kê nhập sai' }),
        actor,
        manager,
      );
    });
  });
});
