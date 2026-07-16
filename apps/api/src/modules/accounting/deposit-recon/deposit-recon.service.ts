import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { DocumentType, ReconStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { CashFundResolverService } from '../cash/cash-fund-resolver.service';
import { CashVoucherCategoryResolverService } from '../cash-vouchers/shared/category-resolver.service';
import { BankPaymentsService } from '../deposit-vouchers/bank-payments/bank-payments.service';
import { BankPaymentPurpose } from '../deposit-vouchers/enums';
import { BANK_FEE_COA_CODE } from '../deposit-fee/deposit-fee.service';
import { DepositAuditAction, DepositAuditEntityType } from '../deposit-audit/deposit-audit-log.entity';
import { DepositAuditService } from '../deposit-audit/deposit-audit.service';
import { DepositReconBatchEntity, DepositReconBatchStatus } from './deposit-recon-batch.entity';
import { ListReconDto } from './dto/list-recon.dto';
import { ReconcileDto } from './dto/reconcile.dto';
import { UnreconcileDto } from './dto/unreconcile.dto';

/** BR-REC-04: a movement CHUA past this many days is flagged stale on the grid. */
const STALE_UNRECONCILED_DAYS = 7;
const BANK_FEE_CATEGORY_CODE = 'BANK_FEE';

const round2 = (v: number): number => Math.round(v * 100) / 100;

export interface ReconcileResult {
  batch: DepositReconBatchEntity;
  systemTotalAmount: number;
  diffAmount: number;
  status: DepositReconBatchStatus;
  proposalId?: string;
}

/**
 * FR-09 — bank-statement reconciliation. `assertNotReconciled` is the guard
 * TKT-DFR-05 (cancel/refund) and the spending module reuse to block edits on
 * a locked movement (BR-REC-01).
 */
@Injectable()
export class DepositReconService {
  constructor(
    @InjectRepository(DepositMovementEntity)
    private readonly movementRepo: Repository<DepositMovementEntity>,
    @InjectRepository(DepositReconBatchEntity)
    private readonly batchRepo: Repository<DepositReconBatchEntity>,
    private readonly dataSource: DataSource,
    private readonly docNumbering: DocumentNumberingService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
    private readonly bankPayment: BankPaymentsService,
    private readonly audit: DepositAuditService,
  ) {}

  async list(
    query: ListReconDto,
    actor: ActorContext,
  ): Promise<{
    data: DepositMovementEntity[];
    total: number;
    rowCount: number;
    totalAmount: number;
    hasStaleUnreconciled: boolean;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const qb = this.buildListQuery(query, actor);

    const [data, total] = await qb
      .orderBy('m.docDate', 'ASC')
      .addOrderBy('m.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const totalAmount = round2(data.reduce((s, m) => s + Number(m.netAmount), 0));
    const hasStaleUnreconciled = await this.hasStale(query, actor);

    return { data, total, rowCount: total, totalAmount, hasStaleUnreconciled, page, pageSize };
  }

  async exportExcel(query: ListReconDto, actor: ActorContext): Promise<Buffer> {
    const qb = this.buildListQuery(query, actor).orderBy('m.docDate', 'ASC').take(5000);
    const rows = await qb.getMany();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Đối chiếu tiền gửi');
    sheet.columns = [
      { header: 'Ngày ghi có', key: 'valueDate', width: 14 },
      { header: 'Ngày chứng từ', key: 'docDate', width: 14 },
      { header: 'Số chứng từ', key: 'documentNumber', width: 18 },
      { header: 'Số tiền thực nhận', key: 'netAmount', width: 18 },
      { header: 'Phí', key: 'feeAmount', width: 14 },
      { header: 'Trạng thái đối chiếu', key: 'reconStatus', width: 16 },
    ];
    for (const r of rows) {
      sheet.addRow({
        valueDate: r.valueDate,
        docDate: r.docDate,
        documentNumber: r.documentNumber,
        netAmount: r.netAmount,
        feeAmount: r.feeAmount,
        reconStatus: r.reconStatus,
      });
    }
    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  async reconcile(dto: ReconcileDto, actor: ActorContext): Promise<ReconcileResult> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .getRepository(DepositMovementEntity)
        .createQueryBuilder('m')
        .setLock('pessimistic_write')
        .where('m.id IN (:...ids)', { ids: dto.movementIds })
        .andWhere('m.organizationId = :org', { org: actor.organizationId })
        .andWhere('m.branchId = :branch', { branch: actor.branchId })
        .andWhere('m.depositAccountId = :acc', { acc: dto.depositAccountId })
        .andWhere('m.reconStatus = :status', { status: ReconStatus.CHUA })
        .getMany();
      if (rows.length !== dto.movementIds.length) {
        throw new BadRequestException(
          'Some movements are already reconciled, deleted, or out of scope',
        );
      }

      // R1: net_amount (post-fee), not gross amount — matches the bank statement.
      const systemTotal = round2(rows.reduce((s, r) => s + Number(r.netAmount), 0));
      const diff = round2(dto.stmtTotalAmount - systemTotal);
      const status =
        diff === 0 ? DepositReconBatchStatus.RECONCILED : DepositReconBatchStatus.DISCREPANCY;
      if (status === DepositReconBatchStatus.DISCREPANCY && !dto.note) {
        throw new BadRequestException(
          'note is required when the statement total does not match (BR-REC-02)',
        );
      }

      const batchNumber = await this.docNumbering.generate(
        DocumentType.RECONCILIATION,
        actor.branchId,
        actor,
      );
      const batch = await manager.getRepository(DepositReconBatchEntity).save(
        manager.getRepository(DepositReconBatchEntity).create({
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          depositAccountId: dto.depositAccountId,
          batchNumber,
          stmtFromDate: dto.stmtFromDate,
          stmtToDate: dto.stmtToDate,
          stmtTotalAmount: dto.stmtTotalAmount,
          systemTotalAmount: systemTotal,
          diffAmount: diff,
          status,
          note: dto.note,
          reconciledBy: actor.userId,
          reconciledAt: new Date(),
        }),
      );

      const nextReconStatus = diff === 0 ? ReconStatus.DA : ReconStatus.LECH;
      await manager.getRepository(DepositMovementEntity).update(
        { id: In(dto.movementIds) },
        {
          reconStatus: nextReconStatus,
          reconBatchId: batch.id,
          reconciledBy: actor.userId,
          reconciledAt: new Date(),
        },
      );

      let proposalId: string | undefined;
      if (diff !== 0) {
        // BR-REC-03: propose only — never auto-adjust the fund balance.
        const proposal = await this.proposeFeeAdjustment(batch, actor, manager);
        proposalId = proposal.voucherId;
      }

      await this.audit.record(
        {
          entityType: DepositAuditEntityType.RECON_BATCH,
          entityId: batch.id,
          action: DepositAuditAction.RECONCILE,
          after: batch,
        },
        actor,
        manager,
      );

      return { batch, systemTotalAmount: systemTotal, diffAmount: diff, status, proposalId };
    });
  }

  async unreconcile(
    dto: UnreconcileDto,
    actor: ActorContext,
  ): Promise<{ updated: number }> {
    return this.dataSource.transaction(async (manager) => {
      let movementIds = dto.movementIds ?? [];
      if (dto.batchId) {
        const inBatch = await manager.getRepository(DepositMovementEntity).find({
          where: { reconBatchId: dto.batchId, organizationId: actor.organizationId },
        });
        movementIds = inBatch.map((m) => m.id);
      }
      if (movementIds.length === 0) {
        throw new BadRequestException('movementIds or batchId is required');
      }

      const before = await manager.getRepository(DepositMovementEntity).find({
        where: { id: In(movementIds), organizationId: actor.organizationId },
      });
      if (before.length === 0) {
        throw new NotFoundException('No matching movements found');
      }

      await manager.getRepository(DepositMovementEntity).update(
        { id: In(movementIds) },
        {
          reconStatus: ReconStatus.CHUA,
          reconBatchId: null,
          reconciledBy: null,
          reconciledAt: null,
        },
      );
      const after = await manager.getRepository(DepositMovementEntity).find({
        where: { id: In(movementIds) },
      });

      await this.audit.record(
        {
          entityType: DepositAuditEntityType.DEPOSIT_MOVEMENT,
          entityId: movementIds[0],
          action: DepositAuditAction.UNRECONCILE,
          before,
          after,
          reason: dto.reason,
        },
        actor,
        manager,
      );

      return { updated: movementIds.length };
    });
  }

  /**
   * BR-REC-01: a reconciled/discrepancy movement is locked against edits.
   * Reused by TKT-DFR-05 (cancel/refund) and the spending module.
   */
  async assertNotReconciled(movementId: string, manager?: EntityManager): Promise<void> {
    const repo = (manager ?? this.dataSource.manager).getRepository(DepositMovementEntity);
    const mv = await repo.findOne({ where: { id: movementId } });
    if (!mv) {
      throw new NotFoundException(`Deposit movement ${movementId} not found`);
    }
    if (mv.reconStatus !== ReconStatus.CHUA) {
      throw new ConflictException(
        'Movement is reconciled and locked; unreconcile first (BR-REC-01)',
      );
    }
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private buildListQuery(query: ListReconDto, actor: ActorContext) {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .where('m.organizationId = :org', { org: actor.organizationId });
    if (actor.branchId) qb.andWhere('m.branchId = :branch', { branch: actor.branchId });
    if (query.depositAccountId) {
      qb.andWhere('m.depositAccountId = :acc', { acc: query.depositAccountId });
    }
    qb.andWhere('m.reconStatus = :status', { status: query.reconStatus ?? ReconStatus.CHUA });
    // R2: match by value_date (when cleared), not doc_date — avoids the
    // "false discrepancy" a statement-period filter on transaction date causes.
    if (query.dateFrom) {
      qb.andWhere('COALESCE(m.valueDate, m.docDate) >= :from', { from: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('COALESCE(m.valueDate, m.docDate) <= :to', { to: query.dateTo });
    }
    if (query.docNumber) {
      qb.andWhere('m.documentNumber ILIKE :doc', { doc: `%${query.docNumber}%` });
    }
    return qb;
  }

  private async hasStale(query: ListReconDto, actor: ActorContext): Promise<boolean> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - STALE_UNRECONCILED_DAYS);
    const qb = this.buildListQuery({ ...query, reconStatus: ReconStatus.CHUA }, actor);
    const count = await qb
      .andWhere('m.docDate <= :cutoff', { cutoff: cutoff.toISOString().slice(0, 10) })
      .getCount();
    return count > 0;
  }

  /** BR-REC-03: DRAFT bank_payment proposal — never posted automatically. */
  private async proposeFeeAdjustment(
    batch: DepositReconBatchEntity,
    actor: ActorContext,
    manager: EntityManager,
  ): Promise<{ voucherId: string }> {
    const contraAccountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
      actor.organizationId,
      BANK_FEE_COA_CODE,
      manager,
    );
    const categoryId = await this.categoryResolver.resolveId(
      actor.organizationId,
      BANK_FEE_CATEGORY_CODE,
    );
    const amount = round2(Math.abs(Number(batch.diffAmount)));
    return this.bankPayment.createDraftInternal(
      {
        purpose: BankPaymentPurpose.BANK_FEE,
        depositAccountId: batch.depositAccountId,
        contraAccountId,
        amount,
        actor,
        docDate: batch.stmtToDate,
        reason: `Đề xuất điều chỉnh phí đối chiếu lô ${batch.batchNumber ?? batch.id}`,
        lines: [{ description: 'Điều chỉnh phí đối chiếu', amount, categoryId }],
      },
      manager,
    );
  }
}
