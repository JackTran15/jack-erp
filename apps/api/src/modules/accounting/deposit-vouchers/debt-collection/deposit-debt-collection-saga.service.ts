import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  DepositMovementSource,
  DepositMovementType,
  DocumentType,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { DepositService } from '../../deposit/deposit.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { DebtCollectionSagaStatus } from '../../cash-vouchers/enums';
import { CashVoucherCategoryResolverService } from '../../cash-vouchers/shared/category-resolver.service';
import {
  InvoiceDebtEntity,
  DebtStatus,
} from '../../../pos/entities/invoice-debt.entity';
import {
  DebtPaymentEntity,
  DebtPaymentMethod,
} from '../../../pos/entities/debt-payment.entity';
import { BankReceiptEntity } from '../bank-receipts/bank-receipt.entity';
import { BankReceiptLineEntity } from '../bank-receipts/bank-receipt-line.entity';
import {
  BankReceiptPurpose,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../enums';
import {
  CreateDepositDebtCollectionReceiptDto,
  DepositDebtCollectionAllocationDto,
} from './dto/create-deposit-debt-collection-receipt.dto';
import {
  DepositDebtCollectionAllocation,
  DepositDebtCollectionSagaEntity,
} from './deposit-debt-collection-saga.entity';

/** Default category code for debt-collection receipt lines (Thu nợ khách hàng). */
const DEBT_COLLECTION_CATEGORY_CODE = 'THU_NO_KH';

export interface DepositDebtCollectionResult {
  sagaId: string;
  receiptId: string;
  documentNumber: string;
  totalAmount: number;
  status: DebtCollectionSagaStatus;
  allocations: DepositDebtCollectionAllocation[];
}

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * Orchestrates "thu hồi nợ" into a deposit fund as a saga: in a single ACID
 * transaction it (1) credits the deposit account, (2) issues a POSTED Phiếu thu
 * tiền gửi, and (3) settles each allocated invoice debt.
 *
 * The deposit twin of {@link DebtCollectionSagaService}. Before this existed the
 * deposit "Thu nợ" purpose only prefilled the form — the money was received but
 * the customer's debt was never reduced.
 */
@Injectable()
export class DepositDebtCollectionSagaService {
  private readonly logger = new Logger(DepositDebtCollectionSagaService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly depositService: DepositService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
    private readonly accountResolver: AccountResolverService,
  ) {}

  async collect(
    dto: CreateDepositDebtCollectionReceiptDto,
    idempotencyKey: string,
    actor: ActorContext,
  ): Promise<DepositDebtCollectionResult> {
    this.assertUniqueAllocations(dto.allocations);
    const total = round(
      dto.allocations.reduce((s, a) => s + Number(a.amount), 0),
    );
    if (total <= 0) {
      throw new BadRequestException('Total collected amount must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      // Idempotency: a completed saga for this key replays its result.
      const existing = await manager.findOne(DepositDebtCollectionSagaEntity, {
        where: { organizationId: actor.organizationId, idempotencyKey },
      });
      if (existing) {
        if (existing.status === DebtCollectionSagaStatus.COMPLETED) {
          const prior = existing.bankReceiptId
            ? await manager.findOne(BankReceiptEntity, {
                where: { id: existing.bankReceiptId },
              })
            : null;
          return this.toResult(existing, prior?.documentNumber ?? '');
        }
        throw new ConflictException(
          'A deposit debt-collection saga with this idempotency key is already in progress',
        );
      }

      // Contra = the org's configured RECEIVABLE account (TK 131 family),
      // resolved server-side like POS checkout — not a hardcoded code lookup.
      const contraAccountId = await this.accountResolver.resolveDefaultAccount(
        AccountingDefaultAccountRole.RECEIVABLE,
        actor,
      );

      const saga = manager.create(DepositDebtCollectionSagaEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        idempotencyKey,
        status: DebtCollectionSagaStatus.PENDING,
        depositAccountId: dto.depositAccountId,
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

      const documentNumber = await this.docNumbering.generate(
        DocumentType.BANK_RECEIPT,
        actor.branchId,
        actor,
      );

      // Step 1 — money into the deposit fund + journal entry (DR 112 / CR 131).
      const { movement, journalEntryId } =
        await this.depositService.recordMovement(
          {
            depositAccountId: dto.depositAccountId,
            type: DepositMovementType.DEPOSIT,
            amount: total,
            contraAccountId,
            source: DepositMovementSource.MANUAL,
            docDate: dto.docDate,
            documentNumber,
          },
          actor,
          manager,
        );

      // Step 2 — issue the POSTED Phiếu thu, linking the movement + JE.
      const categoryId = await this.categoryResolver.resolveId(
        actor.organizationId,
        DEBT_COLLECTION_CATEGORY_CODE,
      );
      const receipt = manager.create(BankReceiptEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        documentNumber,
        depositAccountId: dto.depositAccountId,
        docDate: dto.docDate,
        status: BankVoucherStatus.POSTED,
        purpose: BankReceiptPurpose.DEBT_COLLECTION,
        partnerType: dto.partnerType,
        partnerId: dto.partnerId,
        partnerAddressSnapshot: dto.address,
        payerName: dto.payerName,
        reason: dto.reason,
        collectedBy: dto.collectedBy,
        referenceType: BankReceiptReferenceType.INVOICE_DEBT,
        referenceId: savedSaga.id,
        contraAccountId,
        affectRevenue: false,
        totalAmount: total,
        depositMovementId: movement.id,
        journalEntryId,
        postedAt: new Date(),
        postedBy: actor.userId,
      });
      const savedReceipt = await manager.save(receipt);

      // Step 3 — settle each invoice debt + record the instalment, building one
      // receipt line per allocation.
      const lines: BankReceiptLineEntity[] = [];
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
          journalEntryId,
          dto.collectedBy ?? actor.userId,
          actor,
        );
        alloc.debtPaymentId = debtPayment.id;
        alloc.settled = true;
        lines.push(
          manager.create(BankReceiptLineEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            bankReceiptId: savedReceipt.id,
            lineOrder: i,
            description: `Thu nợ ${debt.referenceCode ?? ''}`.trim(),
            categoryId,
            amount: alloc.amount,
            // Keeps the settled invoice visible on the voucher's "Chứng từ" tab.
            referenceNote: debt.referenceCode ?? undefined,
          }),
        );
      }
      await manager.save(lines);

      savedSaga.bankReceiptId = savedReceipt.id;
      savedSaga.status = DebtCollectionSagaStatus.COMPLETED;
      await manager.save(savedSaga);

      this.logger.log(
        `Deposit debt collection saga ${savedSaga.id} completed: receipt=${documentNumber} total=${total} debts=${savedSaga.allocations.length}`,
      );

      return this.toResult(savedSaga, documentNumber);
    });
  }

  async getSaga(
    id: string,
    actor: ActorContext,
  ): Promise<DepositDebtCollectionSagaEntity> {
    const saga = await this.dataSource.manager.findOne(
      DepositDebtCollectionSagaEntity,
      { where: { id, organizationId: actor.organizationId } },
    );
    if (!saga) {
      throw new NotFoundException(
        `Deposit debt collection saga ${id} not found`,
      );
    }
    return saga;
  }

  /**
   * Compensating action: reopen every settled debt and remove its instalment.
   * Called from BankReceiptsService.reverse within the reversal transaction —
   * the deposit withdrawal / reversing journal entry is handled there.
   */
  async compensate(receiptId: string, manager: EntityManager): Promise<void> {
    const saga = await manager.findOne(DepositDebtCollectionSagaEntity, {
      where: { bankReceiptId: receiptId },
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
        debt.remainingAmount = round(
          Number(debt.originalAmount) - debt.paidAmount,
        );
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
    this.logger.log(`Deposit debt collection saga ${saga.id} compensated`);
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
      // The money landed in a bank/deposit fund, not the drawer.
      paymentMethod: DebtPaymentMethod.BANK_TRANSFER,
      staffId,
      paidAt: new Date(),
      journalEntryId,
    });
    return manager.save(payment);
  }

  private assertUniqueAllocations(
    allocations: DepositDebtCollectionAllocationDto[],
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

  private toResult(
    saga: DepositDebtCollectionSagaEntity,
    documentNumber: string,
  ): DepositDebtCollectionResult {
    return {
      sagaId: saga.id,
      receiptId: saga.bankReceiptId ?? '',
      documentNumber,
      totalAmount: Number(saga.totalAmount),
      status: saga.status,
      allocations: saga.allocations,
    };
  }
}
