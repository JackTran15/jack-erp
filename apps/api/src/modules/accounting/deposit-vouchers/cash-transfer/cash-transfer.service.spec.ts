import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DepositMovementSource,
  DepositTransferStatus,
} from '@erp/shared-interfaces';
import { CashTransferService } from './cash-transfer.service';
import { CashTransferEntity } from './cash-transfer.entity';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto';
import { CashPaymentsService } from '../../cash-vouchers/cash-payments/cash-payments.service';
import { CashReceiptsService } from '../../cash-vouchers/cash-receipts/cash-receipts.service';
import { BankReceiptsService } from '../bank-receipts/bank-receipts.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { PartnerResolverService } from '../../cash-vouchers/shared/partner-resolver.service';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashTransferFundKind,
} from '../../cash-vouchers/enums';
import { BankReceiptPurpose } from '../enums';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actorA: ActorContext = {
  userId: 'user-a',
  organizationId: 'org-1',
  branchId: 'branch-a',
  roles: ['admin'],
};

const actorB: ActorContext = { ...actorA, userId: 'user-b', branchId: 'branch-b' };

const baseDto: CreateCashTransferDto = {
  toBranchId: 'branch-b',
  toFundKind: CashTransferFundKind.CASH,
  amount: 2_000_000,
};

/** A DANG_CHUYEN row as `loadForUpdate` would return it. */
function inTransit(overrides: Partial<CashTransferEntity> = {}): CashTransferEntity {
  return {
    id: 'tr-1',
    organizationId: 'org-1',
    fromBranchId: 'branch-a',
    toBranchId: 'branch-b',
    fromCashAccountId: 'cash-a',
    toFundKind: CashTransferFundKind.CASH,
    toCashAccountId: 'cash-b',
    toDepositAccountId: null,
    amount: 2_000_000,
    status: DepositTransferStatus.DANG_CHUYEN,
    fromPaymentId: 'cp-1',
    toReceiptId: null,
    transferPairId: 'tr-1',
    initiatedBy: 'user-a',
    initiatedAt: new Date('2026-07-21T00:00:00Z'),
    createdAt: new Date('2026-07-21T00:00:00Z'),
    updatedAt: new Date('2026-07-21T00:00:00Z'),
    ...overrides,
  } as CashTransferEntity;
}

async function setup(locked?: CashTransferEntity | null) {
  const savedRows: CashTransferEntity[] = [];
  const scopedRepo = {
    save: jest.fn(async (row: CashTransferEntity) => {
      savedRows.push(row);
      return row;
    }),
  };
  const manager = {
    getRepository: jest.fn().mockReturnValue(scopedRepo),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn().mockReturnValue({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(locked ?? null),
    }),
  };
  const dataSource = { transaction: jest.fn((cb) => cb(manager)) };
  const repo = { create: jest.fn((row) => row), findOne: jest.fn(), createQueryBuilder: jest.fn() };
  const cashPayments = {
    createAndPostInternal: jest.fn().mockResolvedValue({ voucherId: 'cp-1' }),
    reverse: jest.fn().mockResolvedValue({}),
  };
  const cashReceipts = {
    createAndPostInternal: jest.fn().mockResolvedValue({ voucherId: 'cr-1' }),
  };
  const bankReceipts = {
    createAndPostInternal: jest.fn().mockResolvedValue({ voucherId: 'br-1' }),
  };
  const cashFundResolver = {
    resolveCoaAccountIdByCode: jest.fn().mockResolvedValue('acc-113'),
    resolveOrDefault: jest.fn().mockResolvedValue('cash-a'),
    resolveBranchCashFund: jest.fn().mockResolvedValue('cash-b'),
  };
  const partnerResolver = { resolve: jest.fn().mockResolvedValue(null) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CashTransferService,
      { provide: getRepositoryToken(CashTransferEntity), useValue: repo },
      { provide: DataSource, useValue: dataSource },
      { provide: CashPaymentsService, useValue: cashPayments },
      { provide: CashReceiptsService, useValue: cashReceipts },
      { provide: BankReceiptsService, useValue: bankReceipts },
      { provide: CashFundResolverService, useValue: cashFundResolver },
      { provide: PartnerResolverService, useValue: partnerResolver },
    ],
  }).compile();

  return {
    service: module.get(CashTransferService),
    dataSource,
    manager,
    repo,
    savedRows,
    cashPayments,
    cashReceipts,
    bankReceipts,
    cashFundResolver,
  };
}

describe('CashTransferService — create (leg A)', () => {
  it('withdraws from the source cash fund against COA 113 and stores a DANG_CHUYEN row', async () => {
    const { service, manager, cashPayments, savedRows } = await setup();

    await service.create(baseDto, actorA);

    expect(cashPayments.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: CashPaymentPurpose.INTER_BRANCH_OUT,
        cashAccountId: 'cash-a',
        contraAccountId: 'acc-113',
        amount: 2_000_000,
        referenceType: CashPaymentReferenceType.TRANSFER,
      }),
      manager,
    );
    expect(savedRows).toHaveLength(1);
    expect(savedRows[0]).toMatchObject({
      status: DepositTransferStatus.DANG_CHUYEN,
      fromBranchId: 'branch-a',
      toBranchId: 'branch-b',
      fromPaymentId: 'cp-1',
      toReceiptId: null,
    });
  });

  it('uses the same id for referenceId and transfer_pair_id so both legs can find each other', async () => {
    const { service, cashPayments, savedRows } = await setup();

    await service.create(baseDto, actorA);

    const referenceId = cashPayments.createAndPostInternal.mock.calls[0][0].referenceId;
    expect(referenceId).toBe(savedRows[0].id);
    expect(savedRows[0].transferPairId).toBe(referenceId);
  });

  it('resolves the destination branch cash fund for toFundKind=CASH', async () => {
    const { service, cashFundResolver, savedRows } = await setup();

    await service.create(baseDto, actorA);

    expect(cashFundResolver.resolveBranchCashFund).toHaveBeenCalledWith(
      'org-1',
      'branch-b',
      expect.anything(),
    );
    expect(savedRows[0].toCashAccountId).toBe('cash-b');
    expect(savedRows[0].toDepositAccountId).toBeNull();
  });

  it('rejects a transfer to the same branch before touching any voucher', async () => {
    const { service, dataSource, cashPayments } = await setup();

    await expect(
      service.create({ ...baseDto, toBranchId: 'branch-a' }, actorA),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(cashPayments.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('rejects toFundKind=DEPOSIT without toAccountId', async () => {
    const { service, cashPayments } = await setup();

    await expect(
      service.create({ ...baseDto, toFundKind: CashTransferFundKind.DEPOSIT }, actorA),
    ).rejects.toThrow(BadRequestException);
    expect(cashPayments.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('rejects a deposit account that does not belong to the destination branch', async () => {
    const { service, manager, cashPayments } = await setup();
    manager.findOne.mockResolvedValue(null); // no ACTIVE account of branch-b

    await expect(
      service.create(
        {
          ...baseDto,
          toFundKind: CashTransferFundKind.DEPOSIT,
          toAccountId: '11111111-1111-4111-8111-111111111111',
        },
        actorA,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(cashPayments.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('stores the deposit destination when the account checks out', async () => {
    const { service, manager, savedRows } = await setup();
    manager.findOne.mockResolvedValue({ id: 'dep-b' });

    await service.create(
      {
        ...baseDto,
        toFundKind: CashTransferFundKind.DEPOSIT,
        toAccountId: '11111111-1111-4111-8111-111111111111',
      },
      actorA,
    );

    expect(savedRows[0].toDepositAccountId).toBe('dep-b');
    expect(savedRows[0].toCashAccountId).toBeNull();
  });
});

describe('CashTransferService — confirm (leg B)', () => {
  it('credits the destination cash fund and completes the transfer', async () => {
    const { service, manager, cashReceipts, bankReceipts, savedRows } = await setup(inTransit());

    await service.confirm('tr-1', {}, actorB);

    expect(cashReceipts.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: CashReceiptPurpose.INTER_BRANCH_IN,
        cashAccountId: 'cash-b',
        contraAccountId: 'acc-113',
        amount: 2_000_000,
        referenceType: CashReceiptReferenceType.TRANSFER,
        referenceId: 'tr-1',
      }),
      manager,
    );
    expect(bankReceipts.createAndPostInternal).not.toHaveBeenCalled();
    expect(savedRows[0]).toMatchObject({
      status: DepositTransferStatus.HOAN_TAT,
      toReceiptId: 'cr-1',
      confirmedBy: 'user-b',
    });
  });

  it('credits a deposit account and pairs the movement when toFundKind=DEPOSIT', async () => {
    const { service, cashReceipts, bankReceipts, savedRows } = await setup(
      inTransit({
        toFundKind: CashTransferFundKind.DEPOSIT,
        toCashAccountId: null,
        toDepositAccountId: 'dep-b',
      }),
    );

    await service.confirm('tr-1', {}, actorB);

    expect(bankReceipts.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: BankReceiptPurpose.INTER_BRANCH_IN,
        depositAccountId: 'dep-b',
        contraAccountId: 'acc-113',
        affectRevenue: false,
        source: DepositMovementSource.TRANSFER,
        sourceRefLineId: 'IN',
        transferPairId: 'tr-1',
        transferStatus: DepositTransferStatus.HOAN_TAT,
      }),
      expect.anything(),
    );
    expect(cashReceipts.createAndPostInternal).not.toHaveBeenCalled();
    expect(savedRows[0].toReceiptId).toBe('br-1');
  });

  it('carries the party snapshot from leg A onto the destination receipt', async () => {
    const { service, manager, cashReceipts } = await setup(inTransit());
    manager.findOne.mockResolvedValue({
      partnerType: 'SUPPLIER',
      partnerId: 'p-1',
      partnerNameSnapshot: 'Công ty ABC',
      partnerAddressSnapshot: '12 Lê Lợi',
      payeeName: 'Nguyễn Văn A',
      staffId: 'staff-1',
    });

    await service.confirm('tr-1', {}, actorB);

    expect(cashReceipts.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: 'p-1',
        partnerName: 'Công ty ABC',
        partnerAddress: '12 Lê Lợi',
        payerName: 'Nguyễn Văn A',
        staffId: 'staff-1',
      }),
      expect.anything(),
    );
  });

  it('forbids the source branch from confirming', async () => {
    const { service, cashReceipts } = await setup(inTransit());

    await expect(service.confirm('tr-1', {}, actorA)).rejects.toThrow(ForbiddenException);
    expect(cashReceipts.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('rejects confirming a transfer that is no longer in transit', async () => {
    const { service, cashReceipts } = await setup(
      inTransit({ status: DepositTransferStatus.HOAN_TAT }),
    );

    await expect(service.confirm('tr-1', {}, actorB)).rejects.toThrow(ConflictException);
    expect(cashReceipts.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('404s an unknown transfer', async () => {
    const { service } = await setup(null);

    await expect(service.confirm('tr-1', {}, actorB)).rejects.toThrow(NotFoundException);
  });
});

describe('CashTransferService — cancel', () => {
  it('reverses leg A inside the same transaction and marks the transfer cancelled', async () => {
    const { service, manager, cashPayments, savedRows } = await setup(inTransit());

    await service.cancel('tr-1', { reason: 'Nhập nhầm số tiền' }, actorA);

    expect(cashPayments.reverse).toHaveBeenCalledWith(
      'cp-1',
      'Nhập nhầm số tiền',
      actorA,
      manager,
    );
    expect(savedRows[0]).toMatchObject({
      status: DepositTransferStatus.DA_HUY,
      cancelledBy: 'user-a',
      cancelReason: 'Nhập nhầm số tiền',
    });
  });

  it('forbids the destination branch from cancelling', async () => {
    const { service, cashPayments } = await setup(inTransit());

    await expect(
      service.cancel('tr-1', { reason: 'x' }, actorB),
    ).rejects.toThrow(ForbiddenException);
    expect(cashPayments.reverse).not.toHaveBeenCalled();
  });

  it('rejects cancelling an already-completed transfer', async () => {
    const { service, cashPayments } = await setup(
      inTransit({ status: DepositTransferStatus.HOAN_TAT }),
    );

    await expect(
      service.cancel('tr-1', { reason: 'x' }, actorA),
    ).rejects.toThrow(ConflictException);
    expect(cashPayments.reverse).not.toHaveBeenCalled();
  });
});
