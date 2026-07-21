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
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashTransferFundKind,
} from '../../cash-vouchers/enums';
import { CashPaymentEntity } from '../../cash-vouchers/cash-payments/cash-payment.entity';
import { CashPaymentsService } from '../../cash-vouchers/cash-payments/cash-payments.service';
import { CashReceiptsService } from '../../cash-vouchers/cash-receipts/cash-receipts.service';
import { PartnerResolverService } from '../../cash-vouchers/shared/partner-resolver.service';
import {
  partySnapshotFromVoucher,
  resolvePartySnapshot,
} from '../../cash-vouchers/shared/voucher-party';
import { BankReceiptPurpose, BankReceiptReferenceType, BankVoucherPartnerType } from '../enums';
import { BankReceiptsService } from '../bank-receipts/bank-receipts.service';
import { CashTransferEntity } from './cash-transfer.entity';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto';
import { ConfirmCashTransferDto } from './dto/confirm-cash-transfer.dto';
import { CancelCashTransferDto } from './dto/cancel-cash-transfer.dto';
import {
  CashTransferDirection,
  ListCashTransfersQuery,
} from './dto/list-cash-transfers.query';

/** TK 113 "Tiền đang chuyển" — contra for both legs (same account DepositTransferService uses). */
const IN_TRANSIT_COA_CODE = '113';

/** Marks the destination deposit movement of a transfer pair. */
const IN_LEG_LINE_ID = 'IN';

const OUT_LEG_DESCRIPTION = 'Chuyển tiền mặt liên chi nhánh';
const IN_LEG_DESCRIPTION = 'Nhận tiền mặt liên chi nhánh';

/**
 * Inter-branch cash transfer — 2 legs plus an intermediate "money in transit"
 * state. Leg A (create) withdraws from the source branch's cash fund
 * immediately into COA 113; leg B (confirm) credits the destination branch,
 * either its cash fund or one of its deposit accounts, out of 113. Each leg is
 * atomic within its own branch — the cross-branch handoff is intentionally 2
 * separate calls, mirroring DepositTransferService.
 *
 * Lives under deposit-vouchers/ rather than cash-vouchers/ because leg B may be
 * a deposit receipt: this service needs BankReceiptsService, and
 * DepositVouchersModule already imports CashVouchersModule (for
 * FundSwapsService), so the reverse placement would be a circular module.
 */
@Injectable()
export class CashTransferService {
  constructor(
    @InjectRepository(CashTransferEntity)
    private readonly repo: Repository<CashTransferEntity>,
    private readonly dataSource: DataSource,
    private readonly cashPayments: CashPaymentsService,
    private readonly cashReceipts: CashReceiptsService,
    private readonly bankReceipts: BankReceiptsService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly partnerResolver: PartnerResolverService,
  ) {}

  /** Leg A — initiated at branch A. Reduces A's cash fund immediately. */
  async create(
    dto: CreateCashTransferDto,
    actor: ActorContext,
  ): Promise<CashTransferEntity> {
    const fromBranchId = actor.branchId!;
    if (dto.toBranchId === fromBranchId) {
      throw new BadRequestException('Source and destination branch must differ');
    }

    return this.dataSource.transaction(async (manager) => {
      const fromCashAccountId = await this.cashFundResolver.resolveOrDefault(
        actor.organizationId,
        fromBranchId,
        dto.fromCashAccountId,
        manager,
      );
      const contraAccountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
        actor.organizationId,
        IN_TRANSIT_COA_CODE,
        manager,
      );

      // Resolved up-front so a destination branch with no fund/account fails
      // before any voucher is written.
      let toCashAccountId: string | null = null;
      let toDepositAccountId: string | null = null;
      if (dto.toFundKind === CashTransferFundKind.CASH) {
        toCashAccountId = await this.cashFundResolver.resolveBranchCashFund(
          actor.organizationId,
          dto.toBranchId,
          manager,
        );
      } else {
        if (!dto.toAccountId) {
          throw new BadRequestException(
            'toAccountId is required when toFundKind is DEPOSIT',
          );
        }
        const account = await this.assertDepositAccountInBranch(
          manager,
          dto.toAccountId,
          dto.toBranchId,
          actor.organizationId,
        );
        toDepositAccountId = account.id;
      }

      // Generated before the payment so it can be used as referenceId /
      // transferPairId, which is also what createAndPostInternal's
      // findByReference idempotency guard matches on.
      const transferId = randomUUID();
      const party = await resolvePartySnapshot(
        manager,
        this.partnerResolver,
        {
          partnerType: dto.partnerType,
          partnerId: dto.partnerId,
          personName: dto.payeeName,
          address: dto.address,
          staffId: dto.paidBy,
          reason: dto.note,
        },
        actor.organizationId,
      );

      const payment = await this.cashPayments.createAndPostInternal(
        {
          purpose: CashPaymentPurpose.INTER_BRANCH_OUT,
          cashAccountId: fromCashAccountId,
          contraAccountId,
          amount: dto.amount,
          actor,
          voucherDate: dto.docDate,
          referenceType: CashPaymentReferenceType.TRANSFER,
          referenceId: transferId,
          partnerType: party.partnerType,
          partnerId: party.partnerId,
          partnerName: party.partnerName,
          partnerAddress: party.partnerAddress,
          payeeName: party.personName,
          staffId: party.staffId,
          reason: dto.note,
          description: OUT_LEG_DESCRIPTION,
          lines: dto.lines?.map((l) => ({
            description: l.description || OUT_LEG_DESCRIPTION,
            amount: l.amount,
            categoryId: l.categoryId,
          })),
        },
        manager,
      );

      const transfer = this.repo.create({
        id: transferId,
        organizationId: actor.organizationId,
        fromBranchId,
        toBranchId: dto.toBranchId,
        fromCashAccountId,
        toFundKind: dto.toFundKind,
        toCashAccountId,
        toDepositAccountId,
        amount: dto.amount,
        status: DepositTransferStatus.DANG_CHUYEN,
        fromPaymentId: payment.voucherId,
        toReceiptId: null,
        transferPairId: transferId,
        initiatedBy: actor.userId,
        initiatedAt: new Date(),
        note: dto.note ?? null,
      });
      return manager.getRepository(CashTransferEntity).save(transfer);
    });
  }

  /** Leg B — branch B confirms receipt. Credits B's cash fund or deposit account. */
  async confirm(
    id: string,
    dto: ConfirmCashTransferDto,
    actor: ActorContext,
  ): Promise<CashTransferEntity> {
    return this.dataSource.transaction(async (manager) => {
      const transfer = await this.loadForUpdate(manager, id, actor);
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

      // Carry the party from leg A's payment so the destination-branch receipt
      // is not blank — it is the same counterparty on both sides of a transfer.
      const outLeg = await manager.findOne(CashPaymentEntity, {
        where: { id: transfer.fromPaymentId },
      });
      const party = partySnapshotFromVoucher({
        partnerType: outLeg?.partnerType,
        partnerId: outLeg?.partnerId,
        partnerNameSnapshot: outLeg?.partnerNameSnapshot,
        partnerAddressSnapshot: outLeg?.partnerAddressSnapshot,
        personName: outLeg?.payeeName,
        staffId: outLeg?.staffId,
      });

      const amount = Number(transfer.amount);
      let toReceiptId: string;
      if (transfer.toFundKind === CashTransferFundKind.CASH) {
        const receipt = await this.cashReceipts.createAndPostInternal(
          {
            purpose: CashReceiptPurpose.INTER_BRANCH_IN,
            cashAccountId: transfer.toCashAccountId!,
            contraAccountId,
            amount,
            actor,
            referenceType: CashReceiptReferenceType.TRANSFER,
            referenceId: transfer.id,
            partnerType: party.partnerType,
            partnerId: party.partnerId,
            partnerName: party.partnerName,
            partnerAddress: party.partnerAddress,
            payerName: party.personName,
            staffId: party.staffId,
            reason: dto.note ?? transfer.note ?? undefined,
            description: IN_LEG_DESCRIPTION,
          },
          manager,
        );
        toReceiptId = receipt.voucherId;
      } else {
        const receipt = await this.bankReceipts.createAndPostInternal(
          {
            purpose: BankReceiptPurpose.INTER_BRANCH_IN,
            depositAccountId: transfer.toDepositAccountId!,
            contraAccountId,
            amount,
            actor,
            affectRevenue: false,
            referenceType: BankReceiptReferenceType.TRANSFER,
            referenceId: transfer.id,
            source: DepositMovementSource.TRANSFER,
            sourceRefLineId: IN_LEG_LINE_ID,
            transferPairId: transfer.id,
            transferStatus: DepositTransferStatus.HOAN_TAT,
            partnerType: party.partnerType as unknown as BankVoucherPartnerType,
            partnerId: party.partnerId,
            partnerName: party.partnerName,
            partnerAddress: party.partnerAddress,
            payerName: party.personName,
            collectedBy: party.staffId,
            reason: dto.note ?? transfer.note ?? undefined,
            description: IN_LEG_DESCRIPTION,
          },
          manager,
        );
        toReceiptId = receipt.voucherId;
      }

      // cash_movements has no transfer_pair_id/transfer_status columns (unlike
      // deposit_movements), so the in-transit state is tracked solely on this
      // header row — deliberately not widening the movement table.
      Object.assign(transfer, {
        status: DepositTransferStatus.HOAN_TAT,
        toReceiptId,
        confirmedBy: actor.userId,
        confirmedAt: new Date(),
      });
      return manager.getRepository(CashTransferEntity).save(transfer);
    });
  }

  /** Cancel — only while DANG_CHUYEN, only by branch A (reverses leg A). */
  async cancel(
    id: string,
    dto: CancelCashTransferDto,
    actor: ActorContext,
  ): Promise<CashTransferEntity> {
    return this.dataSource.transaction(async (manager) => {
      const transfer = await this.loadForUpdate(manager, id, actor);
      if (transfer.fromBranchId !== actor.branchId) {
        throw new ForbiddenException('Only the source branch can cancel this transfer');
      }
      if (transfer.status !== DepositTransferStatus.DANG_CHUYEN) {
        throw new ConflictException(
          `Transfer ${id} cannot be cancelled — it is already ${transfer.status}`,
        );
      }

      await this.cashPayments.reverse(transfer.fromPaymentId, dto.reason, actor, manager);

      Object.assign(transfer, {
        status: DepositTransferStatus.DA_HUY,
        cancelledBy: actor.userId,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      });
      return manager.getRepository(CashTransferEntity).save(transfer);
    });
  }

  async list(
    query: ListCashTransfersQuery,
    actor: ActorContext,
  ): Promise<{ data: CashTransferEntity[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const branchId = query.branchId ?? actor.branchId;

    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.organizationId = :org', { org: actor.organizationId });

    if (query.direction === CashTransferDirection.OUT) {
      qb.andWhere('t.fromBranchId = :branchId', { branchId });
    } else if (query.direction === CashTransferDirection.IN) {
      qb.andWhere('t.toBranchId = :branchId', { branchId });
    } else if (branchId) {
      qb.andWhere('(t.fromBranchId = :branchId OR t.toBranchId = :branchId)', { branchId });
    }
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.dateFrom) qb.andWhere('t.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('t.createdAt <= :dateTo', { dateTo: query.dateTo });

    qb.orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async getById(id: string, actor: ActorContext): Promise<CashTransferEntity> {
    const transfer = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!transfer) {
      throw new NotFoundException(`Cash transfer ${id} not found`);
    }
    return transfer;
  }

  private async loadForUpdate(
    manager: EntityManager,
    id: string,
    actor: ActorContext,
  ): Promise<CashTransferEntity> {
    const transfer = await manager
      .createQueryBuilder(CashTransferEntity, 't')
      .setLock('pessimistic_write')
      .where('t.id = :id', { id })
      .andWhere('t.organizationId = :org', { org: actor.organizationId })
      .getOne();
    if (!transfer) {
      throw new NotFoundException(`Cash transfer ${id} not found`);
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
