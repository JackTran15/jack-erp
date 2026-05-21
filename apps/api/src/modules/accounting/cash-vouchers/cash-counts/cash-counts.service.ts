import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { CashAccountEntity } from '../../cash/cash-account.entity';
import { CashReceiptsService } from '../cash-receipts/cash-receipts.service';
import { CashPaymentsService } from '../cash-payments/cash-payments.service';
import { CashReceiptPurpose, CashPaymentPurpose } from '../enums';
import {
  CashCountStatus,
  CashCountVarianceVoucherKind,
} from '../enums';
import { CashCountEntity } from './cash-count.entity';
import { CreateCashCountDto } from './dto/create-cash-count.dto';
import { UpdateCashCountDto } from './dto/update-cash-count.dto';
import { QueryCashCountDto } from './dto/query-cash-count.dto';

/** TK 711 "Thu nhập khác" — contra for surplus (variance > 0). */
const OTHER_INCOME_ACCOUNT_CODE = '711';
/** TK 811 "Chi phí khác" — contra for shortage (variance < 0). */
const OTHER_EXPENSE_ACCOUNT_CODE = '811';

export type CashCountView = CashCountEntity & { currentBalance: number };

export interface CashCountPostResult extends CashCountView {
  varianceVoucher: {
    id: string;
    kind: CashCountVarianceVoucherKind;
    documentNumber: string;
  } | null;
}

@Injectable()
export class CashCountsService {
  private readonly logger = new Logger(CashCountsService.name);

  constructor(
    @InjectRepository(CashCountEntity)
    private readonly countRepo: Repository<CashCountEntity>,
    @InjectRepository(CashAccountEntity)
    private readonly cashAccountRepo: Repository<CashAccountEntity>,
    private readonly dataSource: DataSource,
    private readonly docNumbering: DocumentNumberingService,
    private readonly cashReceiptsService: CashReceiptsService,
    private readonly cashPaymentsService: CashPaymentsService,
  ) {}

  async create(
    dto: CreateCashCountDto,
    actor: ActorContext,
  ): Promise<CashCountView> {
    this.assertDenominations(dto.denominations, dto.actualAmount);

    const account = await this.cashAccountRepo.findOne({
      where: { id: dto.cashAccountId, organizationId: actor.organizationId },
    });
    if (!account) {
      throw new NotFoundException(`Cash account ${dto.cashAccountId} not found`);
    }

    const count = this.countRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      cashAccountId: dto.cashAccountId,
      countedAt: new Date(dto.countedAt),
      actualAmount: dto.actualAmount,
      status: CashCountStatus.DRAFT,
      notes: dto.notes,
      denominations: dto.denominations,
    });
    const saved = await this.countRepo.save(count);
    return this.withCurrentBalance(saved, Number(account.balance));
  }

  async update(
    id: string,
    dto: UpdateCashCountDto,
    actor: ActorContext,
  ): Promise<CashCountView> {
    const count = await this.loadOwned(id, actor.organizationId);
    if (count.status !== CashCountStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT cash counts can be updated');
    }

    const nextActual = dto.actualAmount ?? Number(count.actualAmount);
    const nextDenoms = dto.denominations ?? count.denominations;
    this.assertDenominations(nextDenoms, nextActual);

    Object.assign(count, {
      countedAt: dto.countedAt ? new Date(dto.countedAt) : count.countedAt,
      actualAmount: nextActual,
      notes: dto.notes ?? count.notes,
      denominations: nextDenoms,
    });
    const saved = await this.countRepo.save(count);

    const account = await this.cashAccountRepo.findOne({
      where: { id: count.cashAccountId, organizationId: actor.organizationId },
    });
    return this.withCurrentBalance(saved, Number(account?.balance ?? 0));
  }

  async post(id: string, actor: ActorContext): Promise<CashCountPostResult> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the count row first to block concurrent double-post.
      const count = await manager
        .createQueryBuilder(CashCountEntity, 'c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id })
        .andWhere('c.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!count) {
        throw new NotFoundException(`Cash count ${id} not found`);
      }
      if (count.status !== CashCountStatus.DRAFT) {
        throw new BadRequestException(`Cash count ${id} is already posted`);
      }

      // Lock the cash account and snapshot its balance as the expected amount.
      const account = await manager
        .createQueryBuilder(CashAccountEntity, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: count.cashAccountId })
        .andWhere('a.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!account) {
        throw new NotFoundException(
          `Cash account ${count.cashAccountId} not found`,
        );
      }

      const expected = Number(account.balance);
      const actual = Number(count.actualAmount);
      const variance = Number((actual - expected).toFixed(2));

      let varianceVoucher: CashCountPostResult['varianceVoucher'] = null;

      if (variance > 0) {
        const contraAccountId = await this.resolveAccountId(
          manager,
          actor.organizationId,
          OTHER_INCOME_ACCOUNT_CODE,
        );
        const result = await this.cashReceiptsService.createAndPostInternal(
          {
            purpose: CashReceiptPurpose.OTHER_INCOME,
            cashAccountId: count.cashAccountId,
            contraAccountId,
            amount: variance,
            actor,
            reason: `Cash count surplus (${count.documentNumber ?? id})`,
            description: 'Thừa quỹ kiểm kê',
          },
          manager,
        );
        count.varianceVoucherKind = CashCountVarianceVoucherKind.CASH_RECEIPT;
        count.varianceVoucherId = result.voucherId;
        count.varianceCashMovementId = result.cashMovementId;
        varianceVoucher = {
          id: result.voucherId,
          kind: CashCountVarianceVoucherKind.CASH_RECEIPT,
          documentNumber: result.voucherNumber,
        };
      } else if (variance < 0) {
        const contraAccountId = await this.resolveAccountId(
          manager,
          actor.organizationId,
          OTHER_EXPENSE_ACCOUNT_CODE,
        );
        // Shortage → cash payment; insufficient balance throws 400 (rolls back).
        const result = await this.cashPaymentsService.createAndPostInternal(
          {
            purpose: CashPaymentPurpose.OTHER,
            cashAccountId: count.cashAccountId,
            contraAccountId,
            amount: Math.abs(variance),
            actor,
            reason: `Cash count shortage (${count.documentNumber ?? id})`,
            description: 'Thiếu quỹ kiểm kê',
          },
          manager,
        );
        count.varianceVoucherKind = CashCountVarianceVoucherKind.CASH_PAYMENT;
        count.varianceVoucherId = result.voucherId;
        count.varianceCashMovementId = result.cashMovementId;
        varianceVoucher = {
          id: result.voucherId,
          kind: CashCountVarianceVoucherKind.CASH_PAYMENT,
          documentNumber: result.voucherNumber,
        };
      }

      const documentNumber = await this.docNumbering.generate(
        DocumentType.CASH_COUNT,
        actor.branchId,
        actor,
      );

      count.expectedAmount = expected;
      count.variance = variance;
      count.status = CashCountStatus.POSTED;
      count.documentNumber = documentNumber;
      count.postedAt = new Date();
      count.postedBy = actor.userId;
      await manager.save(count);

      this.logger.log(
        `Posted cash count ${documentNumber} (variance=${variance}, voucher=${varianceVoucher?.documentNumber ?? 'none'})`,
      );

      // Re-read balance after the variance movement (if any) for the response.
      const finalBalance = await manager.findOne(CashAccountEntity, {
        where: { id: count.cashAccountId },
      });
      return {
        ...this.withCurrentBalance(count, Number(finalBalance?.balance ?? expected)),
        varianceVoucher,
      };
    });
  }

  async list(
    query: QueryCashCountDto,
    actor: ActorContext,
  ): Promise<{ data: CashCountEntity[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.countRepo
      .createQueryBuilder('c')
      .where('c.organizationId = :org', { org: actor.organizationId });
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    if (query.cashAccountId)
      qb.andWhere('c.cashAccountId = :acc', { acc: query.cashAccountId });

    qb.orderBy('c.countedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async getById(id: string, actor: ActorContext): Promise<CashCountView> {
    const count = await this.loadOwned(id, actor.organizationId);
    const account = await this.cashAccountRepo.findOne({
      where: { id: count.cashAccountId, organizationId: actor.organizationId },
    });
    return this.withCurrentBalance(count, Number(account?.balance ?? 0));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async loadOwned(
    id: string,
    organizationId: string,
  ): Promise<CashCountEntity> {
    const count = await this.countRepo.findOne({
      where: { id, organizationId },
    });
    if (!count) {
      throw new NotFoundException(`Cash count ${id} not found`);
    }
    return count;
  }

  private withCurrentBalance(
    count: CashCountEntity,
    currentBalance: number,
  ): CashCountView {
    return Object.assign(count, { currentBalance });
  }

  private async resolveAccountId(
    manager: EntityManager,
    organizationId: string,
    code: string,
  ): Promise<string> {
    const rows = await manager.query(
      `SELECT "id" FROM "accounts" WHERE "organization_id" = $1 AND "code" = $2 AND "is_active" = true LIMIT 1`,
      [organizationId, code],
    );
    if (!rows || rows.length === 0) {
      throw new BadRequestException(
        `Account ${code} is not configured in the chart of accounts`,
      );
    }
    return rows[0].id;
  }

  private assertDenominations(
    denominations: Array<{ denom: number; count: number }> | undefined,
    actualAmount: number,
  ): void {
    if (!denominations || denominations.length === 0) return;
    const sum = denominations.reduce(
      (acc, d) => acc + Number(d.denom) * Number(d.count),
      0,
    );
    if (Math.abs(sum - Number(actualAmount)) > 0.001) {
      throw new BadRequestException(
        `Denominations total (${sum}) must equal actual amount (${actualAmount})`,
      );
    }
  }
}
