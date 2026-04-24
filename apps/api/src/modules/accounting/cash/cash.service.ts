import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { JournalSource } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { JournalService } from '../journal/journal.service';
import { CashAccountEntity } from './cash-account.entity';
import { CashMovementEntity, CashMovementType } from './cash-movement.entity';
import { CreateCashAccountDto, RecordCashMovementDto } from './dto';

export interface CashListQuery {
  page?: number;
  pageSize?: number;
  branchId?: string;
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
    private readonly dataSource: DataSource,
    private readonly journalService: JournalService,
  ) {}

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
    const cashAccount = await this.accountRepo.findOne({
      where: {
        id: dto.cashAccountId,
        organizationId: actor.organizationId,
      },
    });

    if (!cashAccount) {
      throw new NotFoundException(
        `Cash account ${dto.cashAccountId} not found`,
      );
    }

    const balanceDelta = this.computeBalanceDelta(dto.type, Number(dto.amount));
    const newBalance = Number(cashAccount.balance) + balanceDelta;

    if (newBalance < 0) {
      throw new BadRequestException(
        `Insufficient cash balance. Current: ${cashAccount.balance}, requested: ${dto.type} ${dto.amount}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const movement = manager.create(CashMovementEntity, {
        cashAccountId: dto.cashAccountId,
        type: dto.type,
        amount: dto.amount,
        reference: dto.reference,
        notes: dto.notes,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      });

      const savedMovement = await manager.save(movement);

      cashAccount.balance = newBalance;
      await manager.save(cashAccount);

      const isDebit =
        dto.type === CashMovementType.DEPOSIT ||
        dto.type === CashMovementType.ADJUSTMENT;

      await this.journalService.post(
        {
          source: JournalSource.CASH_MOVEMENT,
          sourceReferenceId: savedMovement.id,
          description: `Cash ${dto.type.toLowerCase()}: ${dto.amount} — ${cashAccount.name}`,
          lines: [
            {
              accountId: cashAccount.accountId,
              debitAmount: isDebit ? Number(dto.amount) : 0,
              creditAmount: isDebit ? 0 : Number(dto.amount),
              description: `Cash account: ${cashAccount.name}`,
              lineOrder: 1,
            },
            {
              accountId: cashAccount.accountId,
              debitAmount: isDebit ? 0 : Number(dto.amount),
              creditAmount: isDebit ? Number(dto.amount) : 0,
              description: `${dto.type} contra`,
              lineOrder: 2,
            },
          ],
        },
        actor,
      );

      this.logger.log(
        `Recorded ${dto.type} of ${dto.amount} on cash account ${cashAccount.name} (id=${cashAccount.id})`,
      );

      return savedMovement;
    });
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
