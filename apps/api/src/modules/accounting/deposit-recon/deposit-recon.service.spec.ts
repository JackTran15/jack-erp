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
          createQueryBuilder: jest.fn(() => {
            const qb: any = {
              setLock: jest.fn(() => qb),
              where: jest.fn(() => qb),
              andWhere: jest.fn(() => qb),
              getMany: jest.fn(async () => movements),
            };
            return qb;
          }),
          find: jest.fn(async () => movements),
          update: jest.fn(async (crit: any, patch: any) => {
            for (const m of movements) Object.assign(m, patch);
            return { affected: movements.length };
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
  const docNumbering = { generate: jest.fn().mockResolvedValue('DS-26-00001') };
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
    it('diff=0: sets DA + batch RECONCILED, using net_amount (not gross amount)', async () => {
      const mv = movement();
      const manager = buildManager([mv]);
      const { service, bankPayment } = await setup(manager);

      const result = await service.reconcile(
        {
          depositAccountId: 'dep-1',
          movementIds: ['mv-1'],
          stmtTotalAmount: 1_122_515,
          stmtFromDate: '2026-07-01',
          stmtToDate: '2026-07-15',
        },
        actor,
      );

      expect(result.systemTotalAmount).toBe(1_122_515);
      expect(result.diffAmount).toBe(0);
      expect(result.status).toBe(DepositReconBatchStatus.RECONCILED);
      expect(mv.reconStatus).toBe(ReconStatus.DA);
      expect(mv.reconBatchId).toBeDefined();
      expect(bankPayment.createDraftInternal).not.toHaveBeenCalled();
    });

    it('diff!=0 with note: sets LECH + batch DISCREPANCY + proposes a fee-adjustment DRAFT (no balance change)', async () => {
      const mv = movement();
      const manager = buildManager([mv]);
      const { service, bankPayment } = await setup(manager);

      const result = await service.reconcile(
        {
          depositAccountId: 'dep-1',
          movementIds: ['mv-1'],
          stmtTotalAmount: 1_110_030,
          stmtFromDate: '2026-07-01',
          stmtToDate: '2026-07-15',
          note: 'Chênh lệch phí thực tế',
        },
        actor,
      );

      expect(result.diffAmount).toBe(-12_485);
      expect(result.status).toBe(DepositReconBatchStatus.DISCREPANCY);
      expect(mv.reconStatus).toBe(ReconStatus.LECH);
      expect(bankPayment.createDraftInternal).toHaveBeenCalledTimes(1);
      expect(result.proposalId).toBe('draft-bp-1');
    });

    it('diff!=0 without note: rejects with 400 (BR-REC-02)', async () => {
      const manager = buildManager([movement()]);
      const { service } = await setup(manager);

      await expect(
        service.reconcile(
          {
            depositAccountId: 'dep-1',
            movementIds: ['mv-1'],
            stmtTotalAmount: 1_110_030,
            stmtFromDate: '2026-07-01',
            stmtToDate: '2026-07-15',
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
            depositAccountId: 'dep-1',
            movementIds: ['mv-1', 'mv-2'],
            stmtTotalAmount: 1_122_515,
            stmtFromDate: '2026-07-01',
            stmtToDate: '2026-07-15',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
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
