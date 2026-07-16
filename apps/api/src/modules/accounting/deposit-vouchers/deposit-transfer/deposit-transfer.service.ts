import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  DepositAccountStatus,
  DepositMovementSource,
  DepositTransferStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DepositAccountEntity } from '../../deposit/deposit-account.entity';
import { DepositMovementEntity } from '../../deposit/deposit-movement.entity';
import { DepositFundResolverService } from '../../deposit/deposit-fund-resolver.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { BankPaymentPurpose, BankPaymentReferenceType, BankReceiptPurpose, BankReceiptReferenceType } from '../enums';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import { BankReceiptsService } from '../bank-receipts/bank-receipts.service';
import { DepositTransferEntity } from './deposit-transfer.entity';
import { CreateDepositTransferDto } from './dto/create-deposit-transfer.dto';
import { ConfirmDepositTransferDto } from './dto/confirm-deposit-transfer.dto';
import { CancelDepositTransferDto } from './dto/cancel-deposit-transfer.dto';
import {
  DepositTransferDirection,
  ListDepositTransfersQuery,
} from './dto/list-deposit-transfers.query';

/** TK 113 "Tiền đang chuyển" — contra for both legs (same account FundSwapsService uses). */
const IN_TRANSIT_COA_CODE = '113';

const OUT_LEG_LINE_ID = 'OUT';
const IN_LEG_LINE_ID = 'IN';

/**
 * FR-07 — inter-branch deposit transfer, 2 legs + an intermediate "money in
 * transit" state. Leg A (create) withdraws from the source branch immediately
 * (BR-TRF-01) into COA 113; leg B (confirm) deposits into the destination
 * branch from 113, closing the in-transit amount. Each leg is atomic within
 * its own branch — the cross-branch handoff is intentionally 2 separate calls
 * (ref.md R5), not one distributed transaction.
 */
@Injectable()
export class DepositTransferService {
  constructor(
    @InjectRepository(DepositTransferEntity)
    private readonly repo: Repository<DepositTransferEntity>,
    private readonly dataSource: DataSource,
    private readonly bankPayments: BankPaymentsService,
    private readonly bankReceipts: BankReceiptsService,
    private readonly depositFundResolver: DepositFundResolverService,
    private readonly cashFundResolver: CashFundResolverService,
  ) {}

  /** Leg A — initiated at branch A. Reduces A's fund immediately (BR-TRF-01). */
  async create(
    dto: CreateDepositTransferDto,
    actor: ActorContext,
  ): Promise<DepositTransferEntity> {
    const fromBranchId = actor.branchId!;
    if (dto.toBranchId === fromBranchId) {
      throw new BadRequestException('Source and destination branch must differ');
    }

    return this.dataSource.transaction(async (manager) => {
      const from = await this.depositFundResolver.resolveBranchDefaultAccount(
        actor.organizationId,
        fromBranchId,
      );
      const to = await this.assertDepositAccountInBranch(
        manager,
        dto.toAccountId,
        dto.toBranchId,
        actor.organizationId,
      );

      const transferId = randomUUID();
      const contraAccountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
        actor.organizationId,
        IN_TRANSIT_COA_CODE,
        manager,
      );

      const payment = await this.bankPayments.createAndPostInternal(
        {
          purpose: BankPaymentPurpose.INTER_BRANCH_OUT,
          depositAccountId: from.id,
          contraAccountId,
          amount: dto.amount,
          actor,
          referenceType: BankPaymentReferenceType.TRANSFER,
          referenceId: transferId,
          source: DepositMovementSource.TRANSFER,
          sourceRefLineId: OUT_LEG_LINE_ID,
          transferPairId: transferId,
          transferStatus: DepositTransferStatus.DANG_CHUYEN,
          affectExpense: false,
          reason: dto.note,
          description: 'Chuyển tiền gửi liên chi nhánh',
        },
        manager,
      );

      const transfer = this.repo.create({
        id: transferId,
        organizationId: actor.organizationId,
        fromBranchId,
        toBranchId: dto.toBranchId,
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: dto.amount,
        status: DepositTransferStatus.DANG_CHUYEN,
        fromPaymentId: payment.voucherId,
        toReceiptId: null,
        transferPairId: transferId,
        initiatedBy: actor.userId,
        initiatedAt: new Date(),
        note: dto.note ?? null,
      });
      return manager.getRepository(DepositTransferEntity).save(transfer);
    });
  }

  /** Leg B — branch B confirms receipt. Increases B's fund, closes the in-transit amount. */
  async confirm(
    id: string,
    dto: ConfirmDepositTransferDto,
    actor: ActorContext,
  ): Promise<DepositTransferEntity> {
    return this.dataSource.transaction(async (manager) => {
      const transfer = await manager
        .createQueryBuilder(DepositTransferEntity, 't')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id })
        .andWhere('t.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!transfer) {
        throw new NotFoundException(`Deposit transfer ${id} not found`);
      }
      if (transfer.toBranchId !== actor.branchId) {
        throw new ForbiddenException('Only the destination branch can confirm this transfer');
      }
      if (transfer.status !== DepositTransferStatus.DANG_CHUYEN) {
        throw new ConflictException(`Transfer ${id} is not in transit`);
      }

      const contraAccountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
        actor.organizationId,
        IN_TRANSIT_COA_CODE,
        manager,
      );

      const receipt = await this.bankReceipts.createAndPostInternal(
        {
          purpose: BankReceiptPurpose.INTER_BRANCH_IN,
          depositAccountId: transfer.toAccountId,
          contraAccountId,
          amount: Number(transfer.amount),
          actor,
          referenceType: BankReceiptReferenceType.TRANSFER,
          referenceId: transfer.id,
          source: DepositMovementSource.TRANSFER,
          sourceRefLineId: IN_LEG_LINE_ID,
          transferPairId: transfer.id,
          transferStatus: DepositTransferStatus.HOAN_TAT,
          affectRevenue: false,
          reason: dto.note,
          description: 'Nhận tiền gửi liên chi nhánh',
        },
        manager,
      );

      // Leg A's movement is a status flag flip (transfer_status), not a financial
      // column — keeps the append-only guarantee on amount/journal_entry_id/accounts.
      await manager.update(
        DepositMovementEntity,
        { transferPairId: transfer.id, sourceRefLineId: OUT_LEG_LINE_ID },
        { transferStatus: DepositTransferStatus.HOAN_TAT },
      );

      Object.assign(transfer, {
        status: DepositTransferStatus.HOAN_TAT,
        toReceiptId: receipt.voucherId,
        confirmedBy: actor.userId,
        confirmedAt: new Date(),
      });
      return manager.getRepository(DepositTransferEntity).save(transfer);
    });
  }

  /** Cancel — only while DANG_CHUYEN, only by branch A (reverses leg A). */
  async cancel(
    id: string,
    dto: CancelDepositTransferDto,
    actor: ActorContext,
  ): Promise<DepositTransferEntity> {
    return this.dataSource.transaction(async (manager) => {
      const transfer = await manager
        .createQueryBuilder(DepositTransferEntity, 't')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id })
        .andWhere('t.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!transfer) {
        throw new NotFoundException(`Deposit transfer ${id} not found`);
      }
      if (transfer.fromBranchId !== actor.branchId) {
        throw new ForbiddenException('Only the source branch can cancel this transfer');
      }
      if (transfer.status !== DepositTransferStatus.DANG_CHUYEN) {
        throw new ConflictException(`Transfer ${id} cannot be cancelled — it is already ${transfer.status}`);
      }

      await this.bankPayments.reverse(transfer.fromPaymentId, dto.reason, actor, manager);

      Object.assign(transfer, {
        status: DepositTransferStatus.DA_HUY,
        cancelledBy: actor.userId,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      });
      return manager.getRepository(DepositTransferEntity).save(transfer);
    });
  }

  async list(
    query: ListDepositTransfersQuery,
    actor: ActorContext,
  ): Promise<{ data: DepositTransferEntity[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const branchId = query.branchId ?? actor.branchId;

    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.organizationId = :org', { org: actor.organizationId });

    if (query.direction === DepositTransferDirection.OUT) {
      qb.andWhere('t.fromBranchId = :branchId', { branchId });
    } else if (query.direction === DepositTransferDirection.IN) {
      qb.andWhere('t.toBranchId = :branchId', { branchId });
    } else if (branchId) {
      qb.andWhere('(t.fromBranchId = :branchId OR t.toBranchId = :branchId)', { branchId });
    }
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.dateFrom)
      qb.andWhere('t.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('t.createdAt <= :dateTo', { dateTo: query.dateTo });

    qb.orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async getById(id: string, actor: ActorContext): Promise<DepositTransferEntity> {
    const transfer = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!transfer) {
      throw new NotFoundException(`Deposit transfer ${id} not found`);
    }
    return transfer;
  }

  private async assertDepositAccountInBranch(
    manager: EntityManager,
    accountId: string,
    branchId: string,
    organizationId: string,
  ): Promise<DepositAccountEntity> {
    const account = await manager.findOne(DepositAccountEntity, {
      where: {
        id: accountId,
        organizationId,
        branchId,
        status: DepositAccountStatus.ACTIVE,
      },
    });
    if (!account) {
      throw new NotFoundException(
        `Deposit account ${accountId} not found or not an active account of branch ${branchId}`,
      );
    }
    return account;
  }
}
