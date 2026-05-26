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
  SupplierDebtEntity,
  SupplierDebtStatus,
} from '../../../inventory/supplier-debt/supplier-debt.entity';
import {
  SupplierDebtPaymentEntity,
  SupplierDebtPaymentMethod,
} from '../../../inventory/supplier-debt/supplier-debt-payment.entity';
import { CashPaymentEntity } from '../cash-payments/cash-payment.entity';
import { CashPaymentLineEntity } from '../cash-payments/cash-payment-line.entity';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashVoucherStatus,
  DebtCollectionSagaStatus,
} from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';
import {
  CreateSupplierDebtPaymentDto,
  SupplierDebtPaymentAllocationDto,
} from './dto/create-supplier-debt-payment.dto';
import {
  SupplierDebtPaymentAllocation,
  SupplierDebtPaymentSagaEntity,
} from './supplier-debt-payment-saga.entity';

/** TK 331 "Phải trả người bán" — contra account when paying a supplier debt. */
const PAYABLE_ACCOUNT_CODE = '331';
/** Default category code for supplier-payment lines (Chi trả nợ nhà cung cấp). */
const SUPPLIER_PAYMENT_CATEGORY_CODE = 'CHI_NO_NCC';

export interface SupplierDebtPaymentResult {
  sagaId: string;
  paymentId: string;
  documentNumber: string;
  totalAmount: number;
  status: DebtCollectionSagaStatus;
  allocations: SupplierDebtPaymentAllocation[];
}

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * Orchestrates "trả nợ NCC" (supplier-debt payment) as a saga — the
 * accounts-payable mirror of DebtCollectionSagaService. In one ACID transaction
 * it (1) withdraws from the branch cash fund (két), (2) issues a POSTED Phiếu
 * Chi, and (3) settles each allocated supplier debt. The saga row records the
 * outcome and enables compensation on reversal.
 */
@Injectable()
export class SupplierDebtPaymentSagaService {
  private readonly logger = new Logger(SupplierDebtPaymentSagaService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cashService: CashService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
  ) {}

  async pay(
    dto: CreateSupplierDebtPaymentDto,
    idempotencyKey: string,
    actor: ActorContext,
  ): Promise<SupplierDebtPaymentResult> {
    this.assertUniqueAllocations(dto.allocations);
    const total = round(
      dto.allocations.reduce((s, a) => s + Number(a.amount), 0),
    );
    if (total <= 0) {
      throw new BadRequestException('Total paid amount must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      // Idempotency: a completed saga for this key replays its result.
      const existing = await manager.findOne(SupplierDebtPaymentSagaEntity, {
        where: { organizationId: actor.organizationId, idempotencyKey },
      });
      if (existing) {
        if (existing.status === DebtCollectionSagaStatus.COMPLETED) {
          const prior = existing.cashPaymentId
            ? await manager.findOne(CashPaymentEntity, {
                where: { id: existing.cashPaymentId },
              })
            : null;
          return this.toResult(existing, prior?.documentNumber ?? '');
        }
        throw new ConflictException(
          'A supplier-debt-payment saga with this idempotency key is already in progress',
        );
      }

      const cashAccountId = await this.cashFundResolver.resolveOrDefault(
        actor.organizationId,
        actor.branchId,
        dto.cashAccountId,
        manager,
      );
      // Contra = payable (TK 331), resolved by code — same source as the goods
      // receipt that created the debt. No default-account role exists for it.
      const contraAccountId = await this.resolveAccountId(
        manager,
        actor.organizationId,
        PAYABLE_ACCOUNT_CODE,
      );

      const saga = manager.create(SupplierDebtPaymentSagaEntity, {
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
          supplierDebtId: a.supplierDebtId,
          amount: round(Number(a.amount)),
          settled: false,
        })),
      });
      const savedSaga = await manager.save(saga);

      // Step 1 — cash out of két + journal entry (DR 331 / CR 1111).
      const { movement, journalEntryId } = await this.cashService.recordMovement(
        {
          cashAccountId,
          type: CashMovementType.WITHDRAWAL,
          amount: total,
          contraAccountId,
          reference: `SUPDEBT-${savedSaga.id}`,
          notes: dto.reason ?? 'Supplier debt payment',
        },
        actor,
        manager,
      );

      // Step 2 — issue the POSTED Phiếu Chi, linking the movement + JE.
      const documentNumber = await this.docNumbering.generate(
        DocumentType.CASH_PAYMENT,
        actor.branchId,
        actor,
      );
      const categoryId = await this.categoryResolver.resolveId(
        actor.organizationId,
        SUPPLIER_PAYMENT_CATEGORY_CODE,
      );
      const payment = manager.create(CashPaymentEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        documentNumber,
        voucherDate: dto.voucherDate,
        status: CashVoucherStatus.POSTED,
        purpose: CashPaymentPurpose.SUPPLIER_PAYMENT,
        partnerType: dto.partnerType,
        partnerId: dto.partnerId,
        payeeName: dto.payeeName,
        reason: dto.reason,
        staffId: dto.staffId,
        referenceType: CashPaymentReferenceType.GOODS_RECEIPT,
        referenceId: savedSaga.id,
        cashAccountId,
        contraAccountId,
        totalAmount: total,
        cashMovementId: movement.id,
        journalEntryId,
        postedAt: new Date(),
        postedBy: actor.userId,
      });
      const savedPayment = await manager.save(payment);

      // Step 3 — settle each supplier debt + record the instalment, building one
      // payment line per allocation.
      const lines: CashPaymentLineEntity[] = [];
      for (let i = 0; i < savedSaga.allocations.length; i++) {
        const alloc = savedSaga.allocations[i];
        const debt = await this.settleDebt(
          manager,
          alloc.supplierDebtId,
          alloc.amount,
          actor,
        );
        const instalment = await this.recordInstalment(
          manager,
          debt,
          alloc.amount,
          savedPayment.id,
          journalEntryId,
          dto.staffId ?? actor.userId,
          actor,
        );
        alloc.supplierDebtPaymentId = instalment.id;
        alloc.settled = true;
        lines.push(
          manager.create(CashPaymentLineEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            cashPaymentId: savedPayment.id,
            lineOrder: i,
            description: `Trả nợ NCC ${debt.referenceCode ?? ''}`.trim(),
            categoryId,
            amount: alloc.amount,
          }),
        );
      }
      await manager.save(lines);

      savedSaga.cashPaymentId = savedPayment.id;
      savedSaga.status = DebtCollectionSagaStatus.COMPLETED;
      await manager.save(savedSaga);

      this.logger.log(
        `Supplier-debt-payment saga ${savedSaga.id} completed: payment=${documentNumber} total=${total} debts=${savedSaga.allocations.length}`,
      );

      return this.toResult(savedSaga, documentNumber);
    });
  }

  async getSaga(
    id: string,
    actor: ActorContext,
  ): Promise<SupplierDebtPaymentSagaEntity> {
    const saga = await this.dataSource.manager.findOne(
      SupplierDebtPaymentSagaEntity,
      { where: { id, organizationId: actor.organizationId } },
    );
    if (!saga) {
      throw new NotFoundException(`Supplier debt payment saga ${id} not found`);
    }
    return saga;
  }

  /**
   * Compensating action: reopen every settled debt and remove its instalment.
   * Called from CashPaymentsService.reverse within the reversal transaction —
   * the cash deposit / reversing journal entry is handled there.
   */
  async compensate(paymentId: string, manager: EntityManager): Promise<void> {
    const saga = await manager.findOne(SupplierDebtPaymentSagaEntity, {
      where: { cashPaymentId: paymentId },
    });
    if (!saga || saga.status !== DebtCollectionSagaStatus.COMPLETED) {
      return;
    }

    for (const alloc of saga.allocations) {
      if (!alloc.settled) continue;
      const debt = await manager
        .createQueryBuilder(SupplierDebtEntity, 'd')
        .setLock('pessimistic_write')
        .where('d.id = :id', { id: alloc.supplierDebtId })
        .getOne();
      if (debt) {
        const paid = round(Number(debt.paidAmount) - alloc.amount);
        debt.paidAmount = paid < 0 ? 0 : paid;
        debt.remainingAmount = round(
          Number(debt.originalAmount) - debt.paidAmount,
        );
        if (debt.remainingAmount > 0) {
          debt.status = SupplierDebtStatus.OPEN;
          (debt as { settledAt?: Date | null }).settledAt = null;
        }
        await manager.save(debt);
      }
      if (alloc.supplierDebtPaymentId) {
        await manager.delete(
          SupplierDebtPaymentEntity,
          alloc.supplierDebtPaymentId,
        );
      }
    }

    saga.status = DebtCollectionSagaStatus.COMPENSATED;
    await manager.save(saga);
    this.logger.log(`Supplier-debt-payment saga ${saga.id} compensated`);
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private async settleDebt(
    manager: EntityManager,
    supplierDebtId: string,
    amount: number,
    actor: ActorContext,
  ): Promise<SupplierDebtEntity> {
    const debt = await manager
      .createQueryBuilder(SupplierDebtEntity, 'd')
      .setLock('pessimistic_write')
      .where('d.id = :id', { id: supplierDebtId })
      .andWhere('d.organizationId = :org', { org: actor.organizationId })
      .getOne();
    if (!debt) {
      throw new NotFoundException(`Supplier debt ${supplierDebtId} not found`);
    }
    if (debt.status === SupplierDebtStatus.PAID) {
      throw new BadRequestException(
        `Supplier debt ${debt.referenceCode ?? supplierDebtId} is already fully paid`,
      );
    }
    if (amount > Number(debt.remainingAmount) + 0.001) {
      throw new BadRequestException(
        `Paid amount (${amount}) exceeds remaining balance (${debt.remainingAmount}) for debt ${debt.referenceCode ?? supplierDebtId}`,
      );
    }

    debt.paidAmount = round(Number(debt.paidAmount) + amount);
    debt.remainingAmount = round(Number(debt.originalAmount) - debt.paidAmount);
    if (debt.remainingAmount <= 0) {
      debt.remainingAmount = 0;
      debt.status = SupplierDebtStatus.PAID;
      debt.settledAt = new Date();
    }
    return manager.save(debt);
  }

  private async recordInstalment(
    manager: EntityManager,
    debt: SupplierDebtEntity,
    amount: number,
    cashPaymentId: string,
    journalEntryId: string,
    staffId: string,
    actor: ActorContext,
  ): Promise<SupplierDebtPaymentEntity> {
    const instalment = manager.create(SupplierDebtPaymentEntity, {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      debtId: debt.id,
      amount,
      paymentMethod: SupplierDebtPaymentMethod.CASH,
      staffId,
      paidAt: new Date(),
      cashPaymentId,
      journalEntryId,
    });
    return manager.save(instalment);
  }

  private assertUniqueAllocations(
    allocations: SupplierDebtPaymentAllocationDto[],
  ): void {
    const ids = new Set<string>();
    for (const a of allocations) {
      if (ids.has(a.supplierDebtId)) {
        throw new BadRequestException(
          `Duplicate supplier debt in allocations: ${a.supplierDebtId}`,
        );
      }
      ids.add(a.supplierDebtId);
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
    saga: SupplierDebtPaymentSagaEntity,
    documentNumber: string,
  ): SupplierDebtPaymentResult {
    return {
      sagaId: saga.id,
      paymentId: saga.cashPaymentId ?? '',
      documentNumber,
      totalAmount: Number(saga.totalAmount),
      status: saga.status,
      allocations: saga.allocations,
    };
  }
}
