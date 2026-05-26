import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CashService } from '../../accounting/cash/cash.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { CashMovementType } from '../../accounting/cash/cash-movement.entity';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../accounting/payment-accounts/enums';
import { OutboxService } from '../../events/outbox/outbox.service';
import { buildCashVoucherNeededEvent } from '../../events/outbox/deterministic-event';
import { InvoiceEntity } from '../entities/invoice.entity';
import {
  InvoiceDebtEntity,
  DebtStatus,
  DebtDocumentType,
} from '../entities/invoice-debt.entity';
import { DebtPaymentEntity, DebtPaymentMethod } from '../entities/debt-payment.entity';

export interface CollectPaymentDto {
  amount: number;
  paymentMethod: DebtPaymentMethod;
  staffId: string;
  note?: string;
  /** Required when paymentMethod=cash (két thu). */
  cashAccountId?: string;
}

@Injectable()
export class InvoiceDebtService {
  private readonly logger = new Logger(InvoiceDebtService.name);

  constructor(
    @InjectRepository(InvoiceDebtEntity)
    private readonly debtRepo: Repository<InvoiceDebtEntity>,
    @InjectRepository(DebtPaymentEntity)
    private readonly paymentRepo: Repository<DebtPaymentEntity>,
    private readonly dataSource: DataSource,
    private readonly cashService: CashService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly outboxService: OutboxService,
    private readonly accountResolver: AccountResolverService,
  ) {}

  async createFromInvoice(
    invoice: InvoiceEntity,
    debtAmount?: number,
    manager?: EntityManager,
  ): Promise<InvoiceDebtEntity> {
    if (!invoice.customerId) {
      throw new BadRequestException(
        'Cannot create debt record: invoice has no associated customer',
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const amount = debtAmount ?? invoice.amountDue;

    const debtData: Partial<InvoiceDebtEntity> = {
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      createdBy: invoice.createdBy,
      referenceCode: invoice.code,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      documentType: DebtDocumentType.CREDIT_INVOICE,
      originalAmount: amount,
      remainingAmount: amount,
      paidAmount: 0,
      issuedAt: today,
      status: DebtStatus.OPEN,
    };

    if (manager) {
      const debtEntity = manager.create(InvoiceDebtEntity, debtData);
      const saved = await manager.save(debtEntity);
      this.logger.log(
        `Created debt record ${saved.id} for invoice ${invoice.id} (customer=${invoice.customerId})`,
      );
      return saved;
    }

    const debtEntity = this.debtRepo.create(debtData);
    const saved = await this.debtRepo.save(debtEntity);
    this.logger.log(
      `Created debt record ${saved.id} for invoice ${invoice.id} (customer=${invoice.customerId})`,
    );
    return saved;
  }

  async findCustomerDebts(
    customerId: string,
    status: DebtStatus | undefined,
    actor: ActorContext,
  ): Promise<InvoiceDebtEntity[]> {
    const where: any = {
      customerId,
      organizationId: actor.organizationId,
    };

    if (status !== undefined) {
      where.status = status;
    }

    return this.debtRepo.find({
      where,
      order: { issuedAt: 'DESC' },
    });
  }

  async collectPayment(
    debtId: string,
    dto: CollectPaymentDto,
    actor: ActorContext,
  ): Promise<InvoiceDebtEntity> {
    return this.dataSource.transaction(async (manager) => {
      const debt = await manager.findOne(InvoiceDebtEntity, {
        where: { id: debtId, organizationId: actor.organizationId },
      });

      if (!debt) {
        throw new NotFoundException(`Debt record ${debtId} not found`);
      }

      if (debt.status === DebtStatus.PAID) {
        throw new BadRequestException(`Debt ${debtId} is already fully paid`);
      }

      if (dto.amount > debt.remainingAmount) {
        throw new BadRequestException(
          `Payment amount (${dto.amount}) exceeds remaining balance (${debt.remainingAmount})`,
        );
      }

      const now = new Date();

      const paymentEntity = manager.create(DebtPaymentEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        debtId,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        staffId: dto.staffId,
        paidAt: now,
        note: dto.note,
      });
      await manager.save(paymentEntity);

      const round = (v: number) => Math.round(v * 100) / 100;
      debt.paidAmount = round(Number(debt.paidAmount) + dto.amount);
      debt.remainingAmount = round(Number(debt.originalAmount) - debt.paidAmount);

      if (debt.remainingAmount <= 0) {
        debt.remainingAmount = 0;
        debt.status = DebtStatus.PAID;
        debt.settledAt = now;
      }

      const updatedDebt = await manager.save(debt);

      // CASH (A-revised): recordMovement posts DR cash / CR 131, updates balance
      // and creates the JE — atomic with the payment. Then enqueue the voucher
      // event so the Phiếu thu document is created async.
      if (dto.paymentMethod === DebtPaymentMethod.CASH) {
        const cashAccountId = await this.cashFundResolver.resolveOrDefault(
          actor.organizationId,
          debt.branchId,
          dto.cashAccountId,
          manager,
        );
        const receivableAccountId =
          await this.accountResolver.resolveDefaultAccount(
            AccountingDefaultAccountRole.RECEIVABLE,
            actor,
          );
        const { movement, journalEntryId } =
          await this.cashService.recordMovement(
            {
              cashAccountId,
              type: CashMovementType.DEPOSIT,
              amount: dto.amount,
              contraAccountId: receivableAccountId,
              reference: `DEBT-${paymentEntity.id}`,
              notes: `Debt collection ${debt.referenceCode ?? debtId}`,
            },
            actor,
            manager,
          );
        paymentEntity.journalEntryId = journalEntryId;
        await manager.save(paymentEntity);

        await this.outboxService.enqueue(
          manager,
          ERP_TOPICS.CASH_VOUCHER_NEEDED_DEBT_PAYMENT,
          buildCashVoucherNeededEvent({
            sourceType: 'DEBT_PAYMENT',
            sourceId: paymentEntity.id,
            sourceDocumentNumber: debt.referenceCode,
            amount: dto.amount,
            cashAccountId,
            contraAccountId: receivableAccountId,
            cashMovementId: movement.id,
            journalEntryId,
            partnerType: 'CUSTOMER',
            partnerId: debt.customerId,
            description: `Thu nợ ${debt.referenceCode ?? ''}`.trim(),
            categoryCode: 'THU_NO_KH',
            organizationId: actor.organizationId,
            branchId: actor.branchId ?? '',
            actorId: actor.userId,
          }),
        );
      }

      this.logger.log(
        `Collected payment of ${dto.amount} for debt ${debtId} (remaining=${updatedDebt.remainingAmount})`,
      );

      return updatedDebt;
    });
  }

  async getPaymentHistory(
    debtId: string,
    actor: ActorContext,
  ): Promise<DebtPaymentEntity[]> {
    const debt = await this.debtRepo.findOne({
      where: { id: debtId, organizationId: actor.organizationId },
    });

    if (!debt) {
      throw new NotFoundException(`Debt record ${debtId} not found`);
    }

    return this.paymentRepo.find({
      where: { debtId },
      order: { paidAt: 'DESC' },
    });
  }
}
