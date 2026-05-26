import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { CashService } from '../../cash/cash.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { CashMovementType } from '../../cash/cash-movement.entity';
import {
  InvoiceDebtEntity,
  DebtStatus,
} from '../../../pos/entities/invoice-debt.entity';
import {
  DebtPaymentEntity,
  DebtPaymentMethod,
} from '../../../pos/entities/debt-payment.entity';
import { CashReceiptEntity } from '../cash-receipts/cash-receipt.entity';
import { CashReceiptLineEntity } from '../cash-receipts/cash-receipt-line.entity';
import {
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashVoucherStatus,
  DebtCollectionSagaStatus,
} from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';
import {
  CreateDebtCollectionReceiptDto,
  DebtCollectionAllocationDto,
} from './dto/create-debt-collection-receipt.dto';
import {
  DebtCollectionAllocation,
  DebtCollectionSagaEntity,
} from './debt-collection-saga.entity';

/** TK 131 "Phải thu khách hàng" — contra account when collecting a debt. */
const RECEIVABLE_ACCOUNT_CODE = '131';
/** Default category code for debt-collection receipt lines (Thu nợ khách hàng). */
const DEBT_COLLECTION_CATEGORY_CODE = 'THU_NO_KH';

export interface DebtCollectionResult {
  sagaId: string;
  receiptId: string;
  documentNumber: string;
  totalAmount: number;
  status: DebtCollectionSagaStatus;
  allocations: DebtCollectionAllocation[];
}

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * Orchestrates "thu hồi nợ" (debt collection) as a saga: in a single ACID
 * transaction it (1) credits the branch cash fund (két), (2) issues a POSTED
 * Phiếu Thu, and (3) settles each allocated invoice debt. The saga row records
 * the outcome for observability and enables compensation on reversal.
 */
@Injectable()
export class DebtCollectionSagaService {
  private readonly logger = new Logger(DebtCollectionSagaService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cashService: CashService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
  ) {}

  async collect(
    dto: CreateDebtCollectionReceiptDto,
    idempotencyKey: string,
    actor: ActorContext,
  ): Promise<DebtCollectionResult> {
    this.assertUniqueAllocations(dto.allocations);
    const total = round(
      dto.allocations.reduce((s, a) => s + Number(a.amount), 0),
    );
    if (total <= 0) {
      throw new BadRequestException('Total collected amount must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      // Idempotency: a completed saga for this key replays its result.
      const existing = await manager.findOne(DebtCollectionSagaEntity, {
        where: { organizationId: actor.organizationId, idempotencyKey },
      });
      if (existing) {
        if (existing.status === DebtCollectionSagaStatus.COMPLETED) {
          const prior = existing.cashReceiptId
            ? await manager.findOne(CashReceiptEntity, {
                where: { id: existing.cashReceiptId },
              })
            : null;
          return this.toResult(existing, prior?.documentNumber ?? '');
        }
        throw new ConflictException(
          'A debt-collection saga with this idempotency key is already in progress',
        );
      }

      const cashAccountId = await this.cashFundResolver.resolveOrDefault(
        actor.organizationId,
        actor.branchId,
        dto.cashAccountId,
        manager,
      );
      const contraAccountId = await this.resolveAccountId(
        manager,
        actor.organizationId,
        RECEIVABLE_ACCOUNT_CODE,
      );

      const saga = manager.create(DebtCollectionSagaEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        idempotencyKey,
        status: DebtCollectionSagaStatus.PENDING,
        cashAccountId,
        contraAccountId,
        partnerType: dto.partnerType,
        partnerId: dto.partnerId,
        totalAmount: total,
        allocations: dto.allocations.map((a) => ({
          invoiceDebtId: a.invoiceDebtId,
          amount: round(Number(a.amount)),
          settled: false,
        })),
      });
      const savedSaga = await manager.save(saga);

      // Step 1 — cash into két + journal entry (DR 1111 / CR 131).
      const { movement, journalEntryId } = await this.cashService.recordMovement(
        {
          cashAccountId,
          type: CashMovementType.DEPOSIT,
          amount: total,
          contraAccountId,
          reference: `DEBTCOL-${savedSaga.id}`,
          notes: dto.reason ?? 'Debt collection',
        },
        actor,
        manager,
      );

      // Step 2 — issue the POSTED Phiếu Thu, linking the movement + JE.
      const documentNumber = await this.docNumbering.generate(
        DocumentType.CASH_RECEIPT,
        actor.branchId,
        actor,
      );
      const categoryId = await this.categoryResolver.resolveId(
        actor.organizationId,
        DEBT_COLLECTION_CATEGORY_CODE,
      );
      const receipt = manager.create(CashReceiptEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        documentNumber,
        voucherDate: dto.voucherDate,
        status: CashVoucherStatus.POSTED,
        purpose: CashReceiptPurpose.DEBT_COLLECTION,
        partnerType: dto.partnerType,
        partnerId: dto.partnerId,
        payerName: dto.payerName,
        reason: dto.reason,
        staffId: dto.staffId,
        referenceType: CashReceiptReferenceType.INVOICE_DEBT,
        referenceId: savedSaga.id,
        cashAccountId,
        contraAccountId,
        totalAmount: total,
        cashMovementId: movement.id,
        journalEntryId,
        postedAt: new Date(),
        postedBy: actor.userId,
      });
      const savedReceipt = await manager.save(receipt);

      // Step 3 — settle each invoice debt + record the instalment, building one
      // receipt line per allocation.
      const lines: CashReceiptLineEntity[] = [];
      for (let i = 0; i < savedSaga.allocations.length; i++) {
        const alloc = savedSaga.allocations[i];
        const debt = await this.settleDebt(
          manager,
          alloc.invoiceDebtId,
          alloc.amount,
          actor,
        );
        const debtPayment = await this.recordInstalment(
          manager,
          debt,
          alloc.amount,
          savedReceipt.id,
          journalEntryId,
          dto.staffId ?? actor.userId,
          actor,
        );
        alloc.debtPaymentId = debtPayment.id;
        alloc.settled = true;
        lines.push(
          manager.create(CashReceiptLineEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            cashReceiptId: savedReceipt.id,
            lineOrder: i,
            description: `Thu nợ ${debt.referenceCode ?? ''}`.trim(),
            categoryId,
            amount: alloc.amount,
          }),
        );
      }
      await manager.save(lines);

      savedSaga.cashReceiptId = savedReceipt.id;
      savedSaga.status = DebtCollectionSagaStatus.COMPLETED;
      await manager.save(savedSaga);

      this.logger.log(
        `Debt collection saga ${savedSaga.id} completed: receipt=${documentNumber} total=${total} debts=${savedSaga.allocations.length}`,
      );

      return this.toResult(savedSaga, documentNumber);
    });
  }

  async getSaga(
    id: string,
    actor: ActorContext,
  ): Promise<DebtCollectionSagaEntity> {
    const saga = await this.dataSource.manager.findOne(
      DebtCollectionSagaEntity,
      { where: { id, organizationId: actor.organizationId } },
    );
    if (!saga) {
      throw new NotFoundException(`Debt collection saga ${id} not found`);
    }
    return saga;
  }

  /**
   * Compensating action: reopen every settled debt and remove its instalment.
   * Called from CashReceiptsService.reverse within the reversal transaction —
   * the cash withdrawal / reversing journal entry is handled there.
   */
  async compensate(receiptId: string, manager: EntityManager): Promise<void> {
    const saga = await manager.findOne(DebtCollectionSagaEntity, {
      where: { cashReceiptId: receiptId },
    });
    if (!saga || saga.status !== DebtCollectionSagaStatus.COMPLETED) {
      return;
    }

    for (const alloc of saga.allocations) {
      if (!alloc.settled) continue;
      const debt = await manager
        .createQueryBuilder(InvoiceDebtEntity, 'd')
        .setLock('pessimistic_write')
        .where('d.id = :id', { id: alloc.invoiceDebtId })
        .getOne();
      if (debt) {
        const paid = round(Number(debt.paidAmount) - alloc.amount);
        debt.paidAmount = paid < 0 ? 0 : paid;
        debt.remainingAmount = round(Number(debt.originalAmount) - debt.paidAmount);
        if (debt.remainingAmount > 0) {
          debt.status = DebtStatus.OPEN;
          (debt as { settledAt?: Date | null }).settledAt = null;
        }
        await manager.save(debt);
      }
      if (alloc.debtPaymentId) {
        await manager.delete(DebtPaymentEntity, alloc.debtPaymentId);
      }
    }

    saga.status = DebtCollectionSagaStatus.COMPENSATED;
    await manager.save(saga);
    this.logger.log(`Debt collection saga ${saga.id} compensated`);
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private async settleDebt(
    manager: EntityManager,
    invoiceDebtId: string,
    amount: number,
    actor: ActorContext,
  ): Promise<InvoiceDebtEntity> {
    const debt = await manager
      .createQueryBuilder(InvoiceDebtEntity, 'd')
      .setLock('pessimistic_write')
      .where('d.id = :id', { id: invoiceDebtId })
      .andWhere('d.organizationId = :org', { org: actor.organizationId })
      .getOne();
    if (!debt) {
      throw new NotFoundException(`Invoice debt ${invoiceDebtId} not found`);
    }
    if (debt.status === DebtStatus.PAID) {
      throw new BadRequestException(
        `Invoice debt ${debt.referenceCode ?? invoiceDebtId} is already fully paid`,
      );
    }
    if (amount > Number(debt.remainingAmount) + 0.001) {
      throw new BadRequestException(
        `Collected amount (${amount}) exceeds remaining balance (${debt.remainingAmount}) for debt ${debt.referenceCode ?? invoiceDebtId}`,
      );
    }

    debt.paidAmount = round(Number(debt.paidAmount) + amount);
    debt.remainingAmount = round(Number(debt.originalAmount) - debt.paidAmount);
    if (debt.remainingAmount <= 0) {
      debt.remainingAmount = 0;
      debt.status = DebtStatus.PAID;
      debt.settledAt = new Date();
    }
    return manager.save(debt);
  }

  private async recordInstalment(
    manager: EntityManager,
    debt: InvoiceDebtEntity,
    amount: number,
    cashReceiptId: string,
    journalEntryId: string,
    staffId: string,
    actor: ActorContext,
  ): Promise<DebtPaymentEntity> {
    const payment = manager.create(DebtPaymentEntity, {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      debtId: debt.id,
      amount,
      paymentMethod: DebtPaymentMethod.CASH,
      staffId,
      paidAt: new Date(),
      cashReceiptId,
      journalEntryId,
    });
    return manager.save(payment);
  }

  private assertUniqueAllocations(
    allocations: DebtCollectionAllocationDto[],
  ): void {
    const ids = new Set<string>();
    for (const a of allocations) {
      if (ids.has(a.invoiceDebtId)) {
        throw new BadRequestException(
          `Duplicate invoice debt in allocations: ${a.invoiceDebtId}`,
        );
      }
      ids.add(a.invoiceDebtId);
    }
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

  private toResult(
    saga: DebtCollectionSagaEntity,
    documentNumber: string,
  ): DebtCollectionResult {
    return {
      sagaId: saga.id,
      receiptId: saga.cashReceiptId ?? '',
      documentNumber,
      totalAmount: Number(saga.totalAmount),
      status: saga.status,
      allocations: saga.allocations,
    };
  }
}
