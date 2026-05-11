import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { JournalSource, SessionStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { JournalService } from '../journal/journal.service';
import { CashAccountEntity, CashAccountType } from './cash-account.entity';
import { CashMovementEntity, CashMovementType } from './cash-movement.entity';
import { CreateCashAccountDto, RecordCashMovementDto } from './dto';
import { PosSessionEntity } from '../../pos/entities/pos-session.entity';

export interface CashListQuery {
  page?: number;
  pageSize?: number;
  branchId?: string;
  type?: CashAccountType;
}

export interface CashMovementListQuery {
  page?: number;
  pageSize?: number;
  cashAccountId?: string;
  type?: CashMovementType;
  branchId?: string;
}

@Injectable()
export class CashService {
  private readonly logger = new Logger(CashService.name);

  constructor(
    @InjectRepository(CashAccountEntity)
    private readonly accountRepo: Repository<CashAccountEntity>,
    @InjectRepository(CashMovementEntity)
    private readonly movementRepo: Repository<CashMovementEntity>,
    @InjectRepository(PosSessionEntity)
    private readonly sessionRepo: Repository<PosSessionEntity>,
    private readonly dataSource: DataSource,
    private readonly journalService: JournalService,
  ) {}

  /** Find an active POS session bound to a cash account (used to auto-fill sessionId on movements). */
  private async findActiveSessionFor(
    cashAccountId: string,
    organizationId: string,
  ): Promise<PosSessionEntity | null> {
    return this.sessionRepo.findOne({
      where: {
        cashAccountId,
        organizationId,
        status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
      },
    });
  }

  async createAccount(
    dto: CreateCashAccountDto,
    actor: ActorContext,
  ): Promise<CashAccountEntity> {
    const account = this.accountRepo.create({
      ...dto,
      balance: dto.balance ?? 0,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });

    const saved = await this.accountRepo.save(account);
    this.logger.log(`Created cash account "${saved.name}" id=${saved.id}`);
    return saved;
  }

  async recordMovement(
    dto: RecordCashMovementDto,
    actor: ActorContext,
  ): Promise<CashMovementEntity> {
    const source = await this.accountRepo.findOne({
      where: { id: dto.cashAccountId, organizationId: actor.organizationId },
    });
    if (!source) {
      throw new NotFoundException(`Cash account ${dto.cashAccountId} not found`);
    }

    if (dto.type === CashMovementType.TRANSFER) {
      return this.recordTransfer(dto, source, actor);
    }

    return this.recordSingleAccountMovement(dto, source, actor);
  }

  private async recordTransfer(
    dto: RecordCashMovementDto,
    source: CashAccountEntity,
    actor: ActorContext,
  ): Promise<CashMovementEntity> {
    if (!dto.toAccountId) {
      throw new BadRequestException('toAccountId is required for TRANSFER');
    }
    if (dto.toAccountId === dto.cashAccountId) {
      throw new BadRequestException('Source and destination must differ');
    }

    const dest = await this.accountRepo.findOne({
      where: { id: dto.toAccountId, organizationId: actor.organizationId },
    });
    if (!dest) {
      throw new NotFoundException(`Destination cash account ${dto.toAccountId} not found`);
    }

    if (source.branchId !== dest.branchId) {
      throw new BadRequestException(
        'Cross-branch transfers are not allowed (source and destination must belong to the same branch)',
      );
    }

    const amount = Number(dto.amount);
    if (Number(source.balance) < amount) {
      throw new BadRequestException(
        `Insufficient balance on source. Current: ${source.balance}, requested: ${amount}`,
      );
    }

    const sessionId =
      (await this.findActiveSessionFor(source.id, actor.organizationId))?.id ?? undefined;

    return this.dataSource.transaction(async (manager) => {
      source.balance = Number(source.balance) - amount;
      dest.balance = Number(dest.balance) + amount;
      await manager.save([source, dest]);

      const movement = manager.create(CashMovementEntity, {
        cashAccountId: source.id,
        toAccountId: dest.id,
        type: CashMovementType.TRANSFER,
        amount,
        reference: dto.reference,
        notes: dto.notes,
        sessionId,
        organizationId: actor.organizationId,
        branchId: source.branchId,
        createdBy: actor.userId,
      });
      const savedMovement = await manager.save(movement);

      await this.journalService.post(
        {
          source: JournalSource.CASH_MOVEMENT,
          sourceReferenceId: savedMovement.id,
          description: `Transfer ${amount}: ${source.name} → ${dest.name}`,
          lines: [
            {
              accountId: dest.accountId,
              debitAmount: amount,
              creditAmount: 0,
              description: `Cash account: ${dest.name}`,
              lineOrder: 1,
            },
            {
              accountId: source.accountId,
              debitAmount: 0,
              creditAmount: amount,
              description: `Cash account: ${source.name}`,
              lineOrder: 2,
            },
          ],
        },
        actor,
      );

      this.logger.log(
        `Recorded TRANSFER ${amount} from ${source.name} → ${dest.name} (id=${savedMovement.id})`,
      );
      return savedMovement;
    });
  }

  private async recordSingleAccountMovement(
    dto: RecordCashMovementDto,
    cashAccount: CashAccountEntity,
    actor: ActorContext,
  ): Promise<CashMovementEntity> {
    if (!dto.contraAccountId) {
      throw new BadRequestException(
        `contraAccountId is required for ${dto.type}`,
      );
    }
    if (dto.contraAccountId === cashAccount.accountId) {
      throw new BadRequestException(
        'contraAccountId must differ from cash account GL account',
      );
    }

    const balanceDelta = this.computeBalanceDelta(dto.type, Number(dto.amount));
    const newBalance = Number(cashAccount.balance) + balanceDelta;

    if (newBalance < 0) {
      throw new BadRequestException(
        `Insufficient cash balance. Current: ${cashAccount.balance}, requested: ${dto.type} ${dto.amount}`,
      );
    }

    const lines = this.buildJournalLines(
      dto.type,
      Number(dto.amount),
      cashAccount.accountId,
      dto.contraAccountId,
    );

    const sessionId =
      (await this.findActiveSessionFor(cashAccount.id, actor.organizationId))?.id ?? undefined;

    return this.dataSource.transaction(async (manager) => {
      const movement = manager.create(CashMovementEntity, {
        cashAccountId: dto.cashAccountId,
        type: dto.type,
        amount: dto.amount,
        reference: dto.reference,
        notes: dto.notes,
        sessionId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      });

      const savedMovement = await manager.save(movement);

      cashAccount.balance = newBalance;
      await manager.save(cashAccount);

      await this.journalService.post(
        {
          source: JournalSource.CASH_MOVEMENT,
          sourceReferenceId: savedMovement.id,
          description: `Cash ${dto.type.toLowerCase()}: ${dto.amount} — ${cashAccount.name}`,
          lines,
        },
        actor,
      );

      this.logger.log(
        `Recorded ${dto.type} of ${dto.amount} on cash account ${cashAccount.name} (id=${cashAccount.id})`,
      );

      return savedMovement;
    });
  }

  private buildJournalLines(
    type: CashMovementType,
    amount: number,
    cashAccountId: string,
    contraAccountId: string,
  ): Array<{
    accountId: string;
    debitAmount: number;
    creditAmount: number;
    description: string;
    lineOrder: number;
  }> {
    switch (type) {
      case CashMovementType.DEPOSIT:
      case CashMovementType.ADJUSTMENT:
        // Money in: DR cash, CR contra
        return [
          {
            accountId: cashAccountId,
            debitAmount: amount,
            creditAmount: 0,
            description: 'Cash account (debit)',
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
      case CashMovementType.WITHDRAWAL:
        // Money out: DR contra, CR cash
        return [
          {
            accountId: contraAccountId,
            debitAmount: amount,
            creditAmount: 0,
            description: 'Contra account (debit)',
            lineOrder: 1,
          },
          {
            accountId: cashAccountId,
            debitAmount: 0,
            creditAmount: amount,
            description: 'Cash account (credit)',
            lineOrder: 2,
          },
        ];
      default:
        throw new BadRequestException(
          `buildJournalLines does not support type ${type}`,
        );
    }
  }

  async getAccount(
    id: string,
    actor: ActorContext,
  ): Promise<CashAccountEntity> {
    const account = await this.accountRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    if (!account) {
      throw new NotFoundException(`Cash account ${id} not found`);
    }

    return account;
  }

  async listAccounts(
    query: CashListQuery,
    actor: ActorContext,
  ): Promise<{
    data: CashAccountEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb: SelectQueryBuilder<CashAccountEntity> = this.accountRepo
      .createQueryBuilder('ca')
      .where('ca.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.branchId) {
      qb.andWhere('ca.branchId = :branchId', { branchId: query.branchId });
    }
    if (query.type) {
      qb.andWhere('ca.type = :type', { type: query.type });
    }

    qb.orderBy('ca.name', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async listMovements(
    query: CashMovementListQuery,
    actor: ActorContext,
  ): Promise<{
    data: CashMovementEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb: SelectQueryBuilder<CashMovementEntity> = this.movementRepo
      .createQueryBuilder('cm')
      .where('cm.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.cashAccountId) {
      qb.andWhere('cm.cashAccountId = :cashAccountId', {
        cashAccountId: query.cashAccountId,
      });
    }
    if (query.type) {
      qb.andWhere('cm.type = :type', { type: query.type });
    }
    if (query.branchId) {
      qb.andWhere('cm.branchId = :branchId', { branchId: query.branchId });
    }

    qb.orderBy('cm.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  private computeBalanceDelta(
    type: CashMovementType,
    amount: number,
  ): number {
    switch (type) {
      case CashMovementType.DEPOSIT:
        return amount;
      case CashMovementType.WITHDRAWAL:
        return -amount;
      case CashMovementType.TRANSFER:
        return -amount;
      case CashMovementType.ADJUSTMENT:
        return amount;
    }
  }
}
