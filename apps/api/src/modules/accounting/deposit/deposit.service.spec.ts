import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositMovementType, JournalSource } from '@erp/shared-interfaces';
import { DepositService } from './deposit.service';
import { JournalService } from '../journal/journal.service';
import { DepositAccountEntity } from './deposit-account.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RecordDepositMovementDto } from './dto/record-movement.dto';

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  branchId: 'br1',
  roles: [],
} as ActorContext;

function makeAccount(over: Partial<DepositAccountEntity> = {}): DepositAccountEntity {
  return {
    id: 'acc1',
    organizationId: 'org1',
    branchId: 'br1',
    name: 'VCB',
    accountId: 'coa-112',
    balance: 1000,
    allowNegative: false,
    ...over,
  } as DepositAccountEntity;
}

function baseDto(over: Partial<RecordDepositMovementDto> = {}): RecordDepositMovementDto {
  return {
    depositAccountId: 'acc1',
    type: DepositMovementType.DEPOSIT,
    amount: 500,
    contraAccountId: 'coa-rev',
    source: 'MANUAL' as RecordDepositMovementDto['source'],
    docDate: '2026-07-15',
    ...over,
  } as RecordDepositMovementDto;
}

describe('DepositService', () => {
  let service: DepositService;
  let journal: { post: jest.Mock };
  let balanceService: { getBalances: jest.Mock };
  let manager: { findOne: jest.Mock; save: jest.Mock };
  let dataSource: {
    transaction: jest.Mock;
    getRepository: jest.Mock;
    manager: { getRepository: jest.Mock };
  };

  beforeEach(() => {
    journal = { post: jest.fn().mockResolvedValue({ id: 'je1' }) };
    // Default: available == book, so the R2 guard never trips unless a test overrides it.
    balanceService = {
      getBalances: jest.fn().mockImplementation((_id, _actor, _asOf) =>
        Promise.resolve({ bookBalance: 1_000_000, availableBalance: 1_000_000, pendingClearingAmount: 0 }),
      ),
    };
    manager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((e) =>
        Promise.resolve(Array.isArray(e) ? e : { id: e.id ?? 'mv1', ...e }),
      ),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
      getRepository: jest.fn().mockReturnValue({ create: (x: object) => ({ ...x }) }),
      manager: { getRepository: jest.fn() },
    };
    service = new DepositService(
      dataSource as unknown as DataSource,
      journal as unknown as JournalService,
      balanceService as any,
    );
  });

  it('DEPOSIT increases balance and posts a BANK_MOVEMENT journal entry', async () => {
    const acc = makeAccount({ balance: 1000 });
    manager.findOne.mockResolvedValueOnce(acc);

    const res = await service.recordMovement(baseDto({ amount: 500 }), actor);

    expect(res.journalEntryId).toBe('je1');
    expect(journal.post).toHaveBeenCalledWith(
      expect.objectContaining({ source: JournalSource.BANK_MOVEMENT }),
      actor,
      manager,
    );
    expect(acc.balance).toBe(1500);
  });

  it('WITHDRAWAL beyond balance is blocked when allow_negative is false', async () => {
    manager.findOne.mockResolvedValueOnce(makeAccount({ balance: 100 }));

    await expect(
      service.recordMovement(
        baseDto({ type: DepositMovementType.WITHDRAWAL, amount: 500 }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(journal.post).not.toHaveBeenCalled();
  });

  it('WITHDRAWAL beyond balance is allowed when allow_negative is true', async () => {
    const acc = makeAccount({ balance: 100, allowNegative: true });
    manager.findOne.mockResolvedValueOnce(acc);

    await service.recordMovement(
      baseDto({ type: DepositMovementType.WITHDRAWAL, amount: 500 }),
      actor,
    );

    expect(acc.balance).toBe(-400);
  });

  it('R2 (TKT-DFR-04): WITHDRAWAL within book balance but beyond available (pending clearing) is blocked', async () => {
    manager.findOne.mockResolvedValueOnce(makeAccount({ balance: 1000 }));
    balanceService.getBalances.mockResolvedValueOnce({
      bookBalance: 1000,
      availableBalance: 300, // 700 not yet cleared (future value_date)
      pendingClearingAmount: 700,
    });

    await expect(
      service.recordMovement(
        baseDto({ type: DepositMovementType.WITHDRAWAL, amount: 500 }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(journal.post).not.toHaveBeenCalled();
  });

  it('R2: WITHDRAWAL within available balance succeeds even when allow_negative is false', async () => {
    const acc = makeAccount({ balance: 1000 });
    manager.findOne.mockResolvedValueOnce(acc);
    balanceService.getBalances.mockResolvedValueOnce({
      bookBalance: 1000,
      availableBalance: 800,
      pendingClearingAmount: 200,
    });

    await service.recordMovement(
      baseDto({ type: DepositMovementType.WITHDRAWAL, amount: 500 }),
      actor,
    );

    expect(acc.balance).toBe(500);
  });

  it('TRANSFER debits source and credits destination', async () => {
    const src = makeAccount({ id: 'src', accountId: 'coa-src', balance: 1000 });
    const dest = makeAccount({ id: 'dest', accountId: 'coa-dest', balance: 200 });
    manager.findOne
      .mockResolvedValueOnce(src) // source (locked)
      .mockResolvedValueOnce(dest); // destination (locked)

    await service.recordMovement(
      baseDto({
        depositAccountId: 'src',
        type: DepositMovementType.TRANSFER,
        toAccountId: 'dest',
        amount: 300,
        contraAccountId: undefined,
      }),
      actor,
    );

    expect(src.balance).toBe(700);
    expect(dest.balance).toBe(500);
  });

  it('createAndPostInternal returns the existing movement on replay (idempotent)', async () => {
    const existing = { id: 'mv-existing', journalEntryId: 'je-existing' };
    dataSource.manager.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue(existing),
    });

    const res = await service.createAndPostInternal(
      baseDto({
        source: 'POS_INVOICE' as RecordDepositMovementDto['source'],
        sourceRefId: 'inv1',
        sourceRefLineId: 'pay1',
      }),
      actor,
    );

    expect(res.replayed).toBe(true);
    expect(res.movement).toBe(existing);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
