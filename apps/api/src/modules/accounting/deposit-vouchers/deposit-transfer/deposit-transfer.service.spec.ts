import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ForbiddenException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DepositAccountStatus, DepositMovementSource, DepositTransferStatus } from '@erp/shared-interfaces';
import { DepositTransferService } from './deposit-transfer.service';
import { DepositTransferEntity } from './deposit-transfer.entity';
import { CreateDepositTransferDto } from './dto/create-deposit-transfer.dto';
import { DepositAccountEntity } from '../../deposit/deposit-account.entity';
import { DepositMovementEntity } from '../../deposit/deposit-movement.entity';
import { DepositFundResolverService } from '../../deposit/deposit-fund-resolver.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import { BankReceiptsService } from '../bank-receipts/bank-receipts.service';
import { BankPaymentPurpose, BankPaymentReferenceType, BankReceiptPurpose, BankReceiptReferenceType } from '../enums';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actorA: ActorContext = {
  userId: 'user-a',
  organizationId: 'org-1',
  branchId: 'branch-a',
  roles: ['admin'],
};
const actorB: ActorContext = { ...actorA, userId: 'user-b', branchId: 'branch-b' };

const baseDto: CreateDepositTransferDto = {
  toBranchId: 'branch-b',
  toAccountId: 'dep-b',
  amount: 10_000_000,
  note: 'Chuyển vốn',
};

function makeTransfer(overrides: Partial<DepositTransferEntity> = {}): DepositTransferEntity {
  return {
    id: 't-1',
    organizationId: 'org-1',
    fromBranchId: 'branch-a',
    toBranchId: 'branch-b',
    fromAccountId: 'dep-a',
    toAccountId: 'dep-b',
    amount: 10_000_000,
    status: DepositTransferStatus.DANG_CHUYEN,
    fromPaymentId: 'bp-1',
    toReceiptId: null,
    transferPairId: 't-1',
    initiatedBy: 'user-a',
    initiatedAt: new Date(),
    confirmedBy: null,
    confirmedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: undefined,
    ...overrides,
  } as DepositTransferEntity;
}

async function setup(opts: { existingTransfer?: DepositTransferEntity | null; findOneAccount?: DepositAccountEntity | null } = {}) {
  const savedRepo = { save: jest.fn((e) => Promise.resolve(e)) };
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(
      opts.existingTransfer !== undefined ? opts.existingTransfer : makeTransfer(),
    ),
  };
  const manager = {
    findOne: jest.fn().mockResolvedValue(
      opts.findOneAccount !== undefined
        ? opts.findOneAccount
        : ({ id: 'dep-b', status: DepositAccountStatus.ACTIVE } as DepositAccountEntity),
    ),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    getRepository: jest.fn().mockReturnValue(savedRepo),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = { transaction: jest.fn((cb) => cb(manager)) };
  const repo = { create: jest.fn((e) => e) };
  const bankPayments = {
    createAndPostInternal: jest
      .fn()
      .mockResolvedValue({ voucherId: 'bp-1', voucherNumber: 'UNC-1', depositMovementId: 'm-1', journalEntryId: 'je-1' }),
    reverse: jest.fn().mockResolvedValue({ original: {}, reversal: {} }),
  };
  const bankReceipts = {
    createAndPostInternal: jest
      .fn()
      .mockResolvedValue({ voucherId: 'br-1', voucherNumber: 'NTTK-1', depositMovementId: 'm-2', journalEntryId: 'je-2' }),
  };
  const depositFundResolver = {
    resolveBranchDefaultAccount: jest.fn().mockResolvedValue({ id: 'dep-a' } as DepositAccountEntity),
  };
  const cashFundResolver = {
    resolveCoaAccountIdByCode: jest.fn().mockResolvedValue('coa-113'),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DepositTransferService,
      { provide: getRepositoryToken(DepositTransferEntity), useValue: repo },
      { provide: DataSource, useValue: dataSource },
      { provide: BankPaymentsService, useValue: bankPayments },
      { provide: BankReceiptsService, useValue: bankReceipts },
      { provide: DepositFundResolverService, useValue: depositFundResolver },
      { provide: CashFundResolverService, useValue: cashFundResolver },
    ],
  }).compile();

  return {
    service: module.get(DepositTransferService),
    manager,
    qb,
    savedRepo,
    bankPayments,
    bankReceipts,
    depositFundResolver,
    cashFundResolver,
  };
}

describe('DepositTransferService', () => {
  describe('create (leg A)', () => {
    it('withdraws from the branch default account into COA 113 and inserts a DANG_CHUYEN header', async () => {
      const { service, manager, bankPayments, savedRepo } = await setup();

      const result = await service.create(baseDto, actorA);

      expect(bankPayments.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: BankPaymentPurpose.INTER_BRANCH_OUT,
          depositAccountId: 'dep-a',
          contraAccountId: 'coa-113',
          amount: 10_000_000,
          referenceType: BankPaymentReferenceType.TRANSFER,
          source: DepositMovementSource.TRANSFER,
          sourceRefLineId: 'OUT',
          transferStatus: DepositTransferStatus.DANG_CHUYEN,
          affectExpense: false,
        }),
        manager,
      );
      expect(savedRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          fromBranchId: 'branch-a',
          toBranchId: 'branch-b',
          fromAccountId: 'dep-a',
          toAccountId: 'dep-b',
          status: DepositTransferStatus.DANG_CHUYEN,
          fromPaymentId: 'bp-1',
          toReceiptId: null,
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejects when the source and destination branch are the same', async () => {
      const { service } = await setup();
      await expect(
        service.create({ ...baseDto, toBranchId: 'branch-a' }, actorA),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown/cross-branch destination account (404)', async () => {
      const { service } = await setup({ findOneAccount: null });
      await expect(service.create(baseDto, actorA)).rejects.toThrow(NotFoundException);
    });

    it('propagates an insufficient-balance failure from the leg-A withdrawal', async () => {
      const { service, bankPayments } = await setup();
      bankPayments.createAndPostInternal.mockRejectedValue(
        new BadRequestException('Insufficient deposit balance'),
      );
      await expect(service.create(baseDto, actorA)).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirm (leg B)', () => {
    it('deposits into the destination account, flips leg-A transfer_status, sets HOAN_TAT', async () => {
      const { service, manager, bankReceipts, savedRepo } = await setup();

      const result = await service.confirm('t-1', { note: 'Đã nhận' }, actorB);

      expect(bankReceipts.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: BankReceiptPurpose.INTER_BRANCH_IN,
          depositAccountId: 'dep-b',
          contraAccountId: 'coa-113',
          amount: 10_000_000,
          referenceType: BankReceiptReferenceType.TRANSFER,
          source: DepositMovementSource.TRANSFER,
          sourceRefLineId: 'IN',
          transferStatus: DepositTransferStatus.HOAN_TAT,
          affectRevenue: false,
        }),
        manager,
      );
      expect(manager.update).toHaveBeenCalledWith(
        DepositMovementEntity,
        { transferPairId: 't-1', sourceRefLineId: 'OUT' },
        { transferStatus: DepositTransferStatus.HOAN_TAT },
      );
      expect(savedRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DepositTransferStatus.HOAN_TAT,
          toReceiptId: 'br-1',
          confirmedBy: 'user-b',
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejects when the actor is not the destination branch', async () => {
      const { service } = await setup();
      await expect(service.confirm('t-1', {}, actorA)).rejects.toThrow(ForbiddenException);
    });

    it('rejects confirming a transfer that is not in transit (BR-TRF-03)', async () => {
      const { service } = await setup({
        existingTransfer: makeTransfer({ status: DepositTransferStatus.HOAN_TAT }),
      });
      await expect(service.confirm('t-1', {}, actorB)).rejects.toThrow(ConflictException);
    });

    it('404s when the transfer does not exist', async () => {
      const { service } = await setup({ existingTransfer: null });
      await expect(service.confirm('missing', {}, actorB)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('reverses leg A and sets DA_HUY when still in transit', async () => {
      const { service, manager, bankPayments, savedRepo } = await setup();

      const result = await service.cancel('t-1', { reason: 'Nhập nhầm' }, actorA);

      expect(bankPayments.reverse).toHaveBeenCalledWith('bp-1', 'Nhập nhầm', actorA, manager);
      expect(savedRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DepositTransferStatus.DA_HUY,
          cancelledBy: 'user-a',
          cancelReason: 'Nhập nhầm',
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejects when the actor is not the source branch', async () => {
      const { service } = await setup();
      await expect(service.cancel('t-1', { reason: 'x' }, actorB)).rejects.toThrow(ForbiddenException);
    });

    it('rejects cancelling a transfer that already completed (BR-TRF-03)', async () => {
      const { service } = await setup({
        existingTransfer: makeTransfer({ status: DepositTransferStatus.HOAN_TAT }),
      });
      await expect(service.cancel('t-1', { reason: 'x' }, actorA)).rejects.toThrow(ConflictException);
    });
  });
});
