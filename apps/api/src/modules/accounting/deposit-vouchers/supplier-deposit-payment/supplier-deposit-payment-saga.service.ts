import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import {
  SupplierDebtEntity,
  SupplierDebtStatus,
} from '../../../inventory/supplier-debt/supplier-debt.entity';
import {
  SupplierDebtPaymentEntity,
  SupplierDebtPaymentMethod,
} from '../../../inventory/supplier-debt/supplier-debt-payment.entity';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashVoucherPartnerType,
  DebtCollectionSagaStatus,
} from '../../cash-vouchers/enums';
import { CashPaymentsService } from '../../cash-vouchers/cash-payments/cash-payments.service';
import { BankPaymentPurpose, BankPaymentReferenceType } from '../enums';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import {
  CreateSupplierDepositPaymentDto,
  SupplierDepositPaymentAllocationDto,
  SupplierDepositPaymentFund,
  SupplierDepositPaymentLegDto,
} from './dto/create-supplier-deposit-payment.dto';
import {
  SupplierDepositPaymentAllocation,
  SupplierDepositPaymentSagaEntity,
} from './supplier-deposit-payment-saga.entity';

/** TK 331 "Phải trả người bán" — contra account when paying a supplier debt. */
const PAYABLE_ACCOUNT_CODE = '331';

export interface SupplierDepositPaymentResult {
  sagaId: string;
  bankPaymentId?: string;
  cashPaymentId?: string;
  documentNumber: string;
  totalAmount: number;
  status: DebtCollectionSagaStatus;
  allocations: SupplierDepositPaymentAllocation[];
}

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * Orchestrates "trả NCC bằng tiền gửi / hỗn hợp" (FR-06, BR-BUY-01..04) — the
 * deposit-fund mirror of SupplierDebtPaymentSagaService. In one ACID transaction
 * it funds one or two legs (deposit and/or cash, BR-BUY-03) via
 * {@link BankPaymentsService.createAndPostInternal} / {@link
 * CashPaymentsService.createAndPostInternal}, then settles every allocated
 * supplier debt directly (there is no reusable payables-reduction service). The
 * saga row records the outcome and enables compensation on reversal.
 */
@Injectable()
export class SupplierDepositPaymentSagaService {
  private readonly logger = new Logger(SupplierDepositPaymentSagaService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => BankPaymentsService))
    private readonly bankPayment: BankPaymentsService,
    private readonly cashPayment: CashPaymentsService,
    private readonly cashFundResolver: CashFundResolverService,
  ) {}

  async pay(
    dto: CreateSupplierDepositPaymentDto,
    idempotencyKey: string,
    actor: ActorContext,
  ): Promise<SupplierDepositPaymentResult> {
    this.assertUniqueAllocations(dto.allocations);
    const totalAllocations = round(
      dto.allocations.reduce((s, a) => s + Number(a.amount), 0),
    );
    const totalLegs = round(dto.legs.reduce((s, l) => s + Number(l.amount), 0));
    if (totalAllocations <= 0) {
      throw new BadRequestException('Total paid amount must be positive');
    }
    if (Math.abs(totalAllocations - totalLegs) > 0.001) {
      throw new BadRequestException(
        `Sum of leg amounts (${totalLegs}) must equal sum of allocation amounts (${totalAllocations})`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(SupplierDepositPaymentSagaEntity, {
        where: { organizationId: actor.organizationId, idempotencyKey },
      });
      if (existing) {
        if (existing.status === DebtCollectionSagaStatus.COMPLETED) {
          return this.toResult(existing);
        }
        throw new ConflictException(
          'A supplier-deposit-payment saga with this idempotency key is already in progress',
        );
      }

      // Contra = payable (TK 331), same source as the goods receipt that
      // created the debt. No default-account role exists for it.
      const contraAccountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
        actor.organizationId,
        PAYABLE_ACCOUNT_CODE,
        manager,
      );

      const saga = manager.create(SupplierDepositPaymentSagaEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        idempotencyKey,
        status: DebtCollectionSagaStatus.PENDING,
        contraAccountId,
        partnerType: dto.partnerType,
        partnerId: dto.partnerId,
        totalAmount: totalAllocations,
        allocations: dto.allocations.map((a) => ({
          supplierDebtId: a.supplierDebtId,
          amount: round(Number(a.amount)),
          settled: false,
        })),
      });
      const savedSaga = await manager.save(saga);

      // Step 1 — fund each leg (deposit and/or cash) + issue its POSTED voucher.
      let documentNumber = '';
      for (const leg of dto.legs) {
        const legDocNumber = await this.payLeg(
          manager,
          leg,
          dto,
          contraAccountId,
          savedSaga,
          actor,
        );
        if (!documentNumber) documentNumber = legDocNumber;
      }
      await manager.save(savedSaga);

      // Step 2 — settle each supplier debt + record the instalment (fund-agnostic).
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
          savedSaga,
          actor,
        );
        alloc.supplierDebtPaymentId = instalment.id;
        alloc.settled = true;
      }

      savedSaga.status = DebtCollectionSagaStatus.COMPLETED;
      await manager.save(savedSaga);

      this.logger.log(
        `Supplier-deposit-payment saga ${savedSaga.id} completed: total=${totalAllocations} debts=${savedSaga.allocations.length}`,
      );

      return this.toResult(savedSaga, documentNumber);
    });
  }

  async getSaga(
    id: string,
    actor: ActorContext,
  ): Promise<SupplierDepositPaymentSagaEntity> {
    const saga = await this.dataSource.manager.findOne(
      SupplierDepositPaymentSagaEntity,
      { where: { id, organizationId: actor.organizationId } },
    );
    if (!saga) {
      throw new NotFoundException(`Supplier deposit payment saga ${id} not found`);
    }
    return saga;
  }

  /**
   * Compensating action: reopen every settled debt and remove its instalment.
   * Called from {@link BankPaymentsService.reverse} within the reversal
   * transaction — the deposit withdrawal-reversal / reversing journal entry is
   * handled there. Looked up by `bankPaymentId` (the DEPOSIT leg) — the mixed
   * BR-BUY-03 cash leg is compensated only when the deposit leg is reversed.
   */
  async compensate(bankPaymentId: string, manager: EntityManager): Promise<void> {
    const saga = await manager.findOne(SupplierDepositPaymentSagaEntity, {
      where: { bankPaymentId },
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
    this.logger.log(`Supplier-deposit-payment saga ${saga.id} compensated`);
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private async payLeg(
    manager: EntityManager,
    leg: SupplierDepositPaymentLegDto,
    dto: CreateSupplierDepositPaymentDto,
    contraAccountId: string,
    saga: SupplierDepositPaymentSagaEntity,
    actor: ActorContext,
  ): Promise<string> {
    if (leg.fund === SupplierDepositPaymentFund.DEPOSIT) {
      if (!leg.depositAccountId) {
        throw new BadRequestException('depositAccountId is required for a DEPOSIT leg');
      }
      const result = await this.bankPayment.createAndPostInternal(
        {
          purpose: BankPaymentPurpose.SUPPLIER_PAYMENT,
          depositAccountId: leg.depositAccountId,
          contraAccountId,
          amount: Number(leg.amount),
          actor,
          docDate: dto.docDate,
          referenceType: BankPaymentReferenceType.PAYABLE,
          referenceId: saga.id,
          partnerType: dto.partnerType,
          partnerId: dto.partnerId,
          payeeName: dto.payeeName,
          reason: dto.reason,
          affectExpense: false,
        },
        manager,
      );
      saga.bankPaymentId = result.voucherId;
      return result.voucherNumber;
    }

    const cashAccountId = await this.cashFundResolver.resolveOrDefault(
      actor.organizationId,
      actor.branchId,
      leg.cashAccountId,
      manager,
    );
    const result = await this.cashPayment.createAndPostInternal(
      {
        purpose: CashPaymentPurpose.SUPPLIER_PAYMENT,
        cashAccountId,
        contraAccountId,
        amount: Number(leg.amount),
        actor,
        voucherDate: dto.docDate,
        referenceType: CashPaymentReferenceType.GOODS_RECEIPT,
        referenceId: saga.id,
        // Bank and cash partner-type enums share identical string values; the
        // type is bridged here in one place (mirrors BankPaymentsService.resolvePartner).
        partnerType: dto.partnerType as unknown as CashVoucherPartnerType,
        partnerId: dto.partnerId,
        payeeName: dto.payeeName,
        reason: dto.reason,
      },
      manager,
    );
    saga.cashPaymentId = result.voucherId;
    return result.voucherNumber;
  }

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
    // BR-BUY-01: no advance payment (OQ-05 gate) — allocation cannot exceed remaining.
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
    saga: SupplierDepositPaymentSagaEntity,
    actor: ActorContext,
  ): Promise<SupplierDebtPaymentEntity> {
    const instalment = manager.create(SupplierDebtPaymentEntity, {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      debtId: debt.id,
      amount,
      // BANK_TRANSFER whenever a deposit leg funded this saga; CASH otherwise
      // (pure-cash-leg saga). The column is a reused observability pointer,
      // not the compensation source of truth (that's saga.allocations).
      paymentMethod: saga.bankPaymentId
        ? SupplierDebtPaymentMethod.BANK_TRANSFER
        : SupplierDebtPaymentMethod.CASH,
      staffId: actor.userId,
      paidAt: new Date(),
      cashPaymentId: saga.bankPaymentId ?? saga.cashPaymentId,
    });
    return manager.save(instalment);
  }

  private assertUniqueAllocations(
    allocations: SupplierDepositPaymentAllocationDto[],
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

  private toResult(
    saga: SupplierDepositPaymentSagaEntity,
    documentNumber = '',
  ): SupplierDepositPaymentResult {
    return {
      sagaId: saga.id,
      bankPaymentId: saga.bankPaymentId,
      cashPaymentId: saga.cashPaymentId,
      documentNumber,
      totalAmount: Number(saga.totalAmount),
      status: saga.status,
      allocations: saga.allocations,
    };
  }
}
