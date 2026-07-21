import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  JournalSource,
  DepositMovementType,
  ReconStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { JournalService } from '../journal/journal.service';
import { DepositAccountEntity } from './deposit-account.entity';
import { DepositMovementEntity } from './deposit-movement.entity';
import { RecordDepositMovementDto } from './dto/record-movement.dto';
import { DepositBalanceService } from './deposit-ledger/deposit-balance.service';

const round2 = (v: number): number => Math.round(v * 100) / 100;

export interface RecordDepositMovementResult {
  movement: DepositMovementEntity;
  journalEntryId: string;
}

export interface CreateAndPostResult extends RecordDepositMovementResult {
  /** True when an existing movement was returned (idempotent replay), no new write. */
  replayed: boolean;
}

interface JournalLine {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
  lineOrder: number;
}

/**
 * Core deposit-fund ledger service — mirrors CashService.recordMovement:
 * records a movement + balanced journal entry (JournalSource.BANK_MOVEMENT) and updates
 * the deposit account balance in real time, all inside one transaction (composed into the
 * caller's `manager` when provided). Negative balance is blocked via SELECT ... FOR UPDATE
 * unless the account allows it (BR-CHI-01 / NFR-03).
 */
@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly journalService: JournalService,
    private readonly balanceService: DepositBalanceService,
  ) {}

  async recordMovement(
    dto: RecordDepositMovementDto,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<RecordDepositMovementResult> {
    return manager
      ? this.recordMovementInTx(dto, actor, manager)
      : this.dataSource.transaction((m) =>
          this.recordMovementInTx(dto, actor, m),
        );
  }

  /**
   * Idempotent entry point for auto-posting (FR-03, DF-05) and future voucher flows.
   * Returns the existing movement when (source, sourceRefId, sourceRefLineId) already
   * exists; otherwise records a new one. On a concurrent duplicate the unique index
   * throws (23505) — callers (the POS consumer) treat that as a no-op replay.
   */
  async createAndPostInternal(
    dto: RecordDepositMovementDto,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<CreateAndPostResult> {
    if (dto.sourceRefId && dto.sourceRefLineId) {
      const repo = (manager ?? this.dataSource.manager).getRepository(
        DepositMovementEntity,
      );
      const existing = await repo.findOne({
        where: {
          source: dto.source,
          sourceRefId: dto.sourceRefId,
          sourceRefLineId: dto.sourceRefLineId,
        },
      });
      if (existing) {
        return {
          movement: existing,
          journalEntryId: existing.journalEntryId ?? '',
          replayed: true,
        };
      }
    }
    const res = await this.recordMovement(dto, actor, manager);
    return { ...res, replayed: false };
  }

  private async recordMovementInTx(
    dto: RecordDepositMovementDto,
    actor: ActorContext,
    manager: EntityManager,
  ): Promise<RecordDepositMovementResult> {
    const source = await manager.findOne(DepositAccountEntity, {
      where: { id: dto.depositAccountId, organizationId: actor.organizationId },
      lock: { mode: 'pessimistic_write' }, // SELECT ... FOR UPDATE (NFR-03)
    });
    if (!source) {
      throw new NotFoundException(
        `Deposit account ${dto.depositAccountId} not found`,
      );
    }

    if (dto.type === DepositMovementType.TRANSFER) {
      return this.recordTransferInTx(dto, source, actor, manager);
    }
    return this.recordSingleAccountMovementInTx(dto, source, actor, manager);
  }

  private async recordSingleAccountMovementInTx(
    dto: RecordDepositMovementDto,
    account: DepositAccountEntity,
    actor: ActorContext,
    manager: EntityManager,
  ): Promise<RecordDepositMovementResult> {
    if (!dto.contraAccountId) {
      throw new BadRequestException(`contraAccountId is required for ${dto.type}`);
    }
    if (dto.contraAccountId === account.accountId) {
      throw new BadRequestException(
        'contraAccountId must differ from the deposit account GL account',
      );
    }

    const amount = Number(dto.amount);
    const delta = this.computeBalanceDelta(dto.type, amount);
    const newBalance = Number(account.balance) + delta;
    if (newBalance < 0 && !account.allowNegative) {
      throw new BadRequestException(
        `Insufficient deposit balance. Current: ${account.balance}, requested: ${dto.type} ${amount}`,
      );
    }
    // R2 (TKT-DFR-04): a WITHDRAWAL must not spend money that hasn't cleared
    // yet (value_date in the future) even when the book balance covers it.
    if (dto.type === DepositMovementType.WITHDRAWAL && !account.allowNegative) {
      const { availableBalance, bookBalance } = await this.balanceService.getBalances(
        account.id,
        actor,
        undefined,
        manager,
      );
      if (round2(availableBalance - amount) < 0) {
        throw new BadRequestException(
          `Insufficient available deposit balance. Available: ${availableBalance}, book: ${bookBalance}, requested: WITHDRAWAL ${amount}`,
        );
      }
    }

    const movement = await manager.save(
      this.buildMovement(dto, account, amount, actor),
    );

    const journalEntry = await this.journalService.post(
      {
        source: JournalSource.BANK_MOVEMENT,
        sourceReferenceId: movement.id,
        description: `Deposit ${dto.type.toLowerCase()}: ${amount} — ${account.name}`,
        lines: this.buildJournalLines(
          dto.type,
          amount,
          account.accountId,
          dto.contraAccountId,
        ),
      },
      actor,
      manager,
    );

    movement.journalEntryId = journalEntry.id;
    await manager.save(movement);

    account.balance = newBalance;
    await manager.save(account);

    this.logger.log(
      `Recorded ${dto.type} of ${amount} on deposit account ${account.name} (id=${account.id})`,
    );
    return { movement, journalEntryId: journalEntry.id };
  }

  private async recordTransferInTx(
    dto: RecordDepositMovementDto,
    source: DepositAccountEntity,
    actor: ActorContext,
    manager: EntityManager,
  ): Promise<RecordDepositMovementResult> {
    if (!dto.toAccountId) {
      throw new BadRequestException('toAccountId is required for TRANSFER');
    }
    if (dto.toAccountId === dto.depositAccountId) {
      throw new BadRequestException('Source and destination must differ');
    }
    const dest = await manager.findOne(DepositAccountEntity, {
      where: { id: dto.toAccountId, organizationId: actor.organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!dest) {
      throw new NotFoundException(
        `Destination deposit account ${dto.toAccountId} not found`,
      );
    }

    const amount = Number(dto.amount);
    const newSourceBalance = Number(source.balance) - amount;
    if (newSourceBalance < 0 && !source.allowNegative) {
      throw new BadRequestException(
        `Insufficient deposit balance. Current: ${source.balance}, requested: TRANSFER ${amount}`,
      );
    }

    const movement = await manager.save(
      this.buildMovement(dto, source, amount, actor),
    );

    const journalEntry = await this.journalService.post(
      {
        source: JournalSource.BANK_MOVEMENT,
        sourceReferenceId: movement.id,
        description: `Deposit transfer ${amount}: ${source.name} → ${dest.name}`,
        lines: [
          {
            accountId: dest.accountId,
            debitAmount: amount,
            creditAmount: 0,
            description: `Deposit account: ${dest.name}`,
            lineOrder: 1,
          },
          {
            accountId: source.accountId,
            debitAmount: 0,
            creditAmount: amount,
            description: `Deposit account: ${source.name}`,
            lineOrder: 2,
          },
        ],
      },
      actor,
      manager,
    );

    movement.journalEntryId = journalEntry.id;
    await manager.save(movement);

    source.balance = newSourceBalance;
    dest.balance = Number(dest.balance) + amount;
    await manager.save([source, dest]);

    this.logger.log(
      `Recorded TRANSFER ${amount} from ${source.name} → ${dest.name} (id=${movement.id})`,
    );
    return { movement, journalEntryId: journalEntry.id };
  }

  private buildMovement(
    dto: RecordDepositMovementDto,
    account: DepositAccountEntity,
    amount: number,
    actor: ActorContext,
  ): DepositMovementEntity {
    const repo = this.dataSource.getRepository(DepositMovementEntity);
    return repo.create({
      organizationId: actor.organizationId,
      branchId: account.branchId,
      depositAccountId: account.id,
      toAccountId: dto.toAccountId ?? null,
      type: dto.type,
      amount,
      feeAmount: dto.feeAmount ?? 0,
      netAmount: dto.netAmount ?? amount,
      docDate: dto.docDate,
      valueDate: dto.valueDate ?? null,
      reconStatus: ReconStatus.CHUA,
      source: dto.source,
      sourceRefId: dto.sourceRefId ?? null,
      sourceRefLineId: dto.sourceRefLineId ?? null,
      journalEntryId: null,
      documentNumber: dto.documentNumber ?? null,
      transferPairId: dto.transferPairId ?? null,
      transferStatus: dto.transferStatus ?? null,
      createdBy: actor.userId,
    });
  }

  private buildJournalLines(
    type: DepositMovementType,
    amount: number,
    depositCoaId: string,
    contraAccountId: string,
  ): JournalLine[] {
    switch (type) {
      case DepositMovementType.DEPOSIT:
      case DepositMovementType.ADJUSTMENT:
        // Money in: DR deposit COA, CR contra
        return [
          {
            accountId: depositCoaId,
            debitAmount: amount,
            creditAmount: 0,
            description: 'Deposit account (debit)',
            lineOrder: 1,
          },
          {
            accountId: contraAccountId,
            debitAmount: 0,
            creditAmount: amount,
            description: 'Contra account (credit)',
            lineOrder: 2,
          },
        ];
      case DepositMovementType.WITHDRAWAL:
        // Money out: DR contra, CR deposit COA
        return [
          {
            accountId: contraAccountId,
            debitAmount: amount,
            creditAmount: 0,
            description: 'Contra account (debit)',
            lineOrder: 1,
          },
          {
            accountId: depositCoaId,
            debitAmount: 0,
            creditAmount: amount,
            description: 'Deposit account (credit)',
            lineOrder: 2,
          },
        ];
      default:
        throw new BadRequestException(
          `buildJournalLines does not support type ${type}`,
        );
    }
  }

  private computeBalanceDelta(type: DepositMovementType, amount: number): number {
    switch (type) {
      case DepositMovementType.DEPOSIT:
      case DepositMovementType.ADJUSTMENT:
        return amount;
      case DepositMovementType.WITHDRAWAL:
      case DepositMovementType.TRANSFER:
        return -amount;
    }
  }
}
