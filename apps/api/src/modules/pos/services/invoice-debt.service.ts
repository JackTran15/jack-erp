import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  EntityManager,
  In,
  FindOptionsWhere,
} from 'typeorm';
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
import { CashReceiptEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { CustomerDebtLedgerRowDto } from '../dto/customer-debt-ledger-row.dto';

export interface CollectPaymentDto {
  amount: number;
  paymentMethod: DebtPaymentMethod;
  staffId: string;
  note?: string;
  /** Required when paymentMethod=cash (két thu). */
  cashAccountId?: string;
}

/** Credit terms entered at checkout, stored per invoice on the debt record. */
export interface DebtTerms {
  dueDate?: string | null;
  creditDays?: number | null;
}

/** Add `days` to an ISO `YYYY-MM-DD` date, returning a new ISO date string. */
function addDaysIso(iso: string, days: number): string {
  const ms = new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(ms).toISOString().split('T')[0];
}

/** Whole days from `fromIso` to `toIso` (ISO `YYYY-MM-DD`), may be negative. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

@Injectable()
export class InvoiceDebtService {
  private readonly logger = new Logger(InvoiceDebtService.name);

  constructor(
    @InjectRepository(InvoiceDebtEntity)
    private readonly debtRepo: Repository<InvoiceDebtEntity>,
    @InjectRepository(DebtPaymentEntity)
    private readonly paymentRepo: Repository<DebtPaymentEntity>,
    @InjectRepository(CashReceiptEntity)
    private readonly cashReceiptRepo: Repository<CashReceiptEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
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
    debtTerms?: DebtTerms,
  ): Promise<InvoiceDebtEntity> {
    if (!invoice.customerId) {
      throw new BadRequestException(
        'Cannot create debt record: invoice has no associated customer',
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const amount = debtAmount ?? invoice.amountDue;

    // Resolve due date / credit term. Clients usually send both, but derive the
    // missing one when only a date or only a day count is provided.
    let dueDate = debtTerms?.dueDate ?? null;
    let creditDays = debtTerms?.creditDays ?? null;
    if (!dueDate && creditDays != null) dueDate = addDaysIso(today, creditDays);
    if (dueDate && creditDays == null) creditDays = daysBetween(today, dueDate);
    if (dueDate && dueDate < today) {
      throw new BadRequestException('dueDate must be on or after the issue date');
    }

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
      dueDate: dueDate ?? undefined,
      creditDays: creditDays ?? undefined,
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

  /**
   * Customer debt ledger: debt-raising documents (`invoice_debts`) merged with
   * their collections (`debt_payments`, written by both the POS collect endpoint
   * and the backoffice Phiếu thu saga). Each row carries a signed `amount`
   * (+ raises debt, − collects) and a `runningBalance`, ordered oldest-first.
   */
  async findCustomerDebts(
    customerId: string,
    status: DebtStatus | undefined,
    actor: ActorContext,
  ): Promise<CustomerDebtLedgerRowDto[]> {
    const where: FindOptionsWhere<InvoiceDebtEntity> = {
      customerId,
      organizationId: actor.organizationId,
    };

    if (status !== undefined) {
      where.status = status;
    }

    const debts = await this.debtRepo.find({
      where,
      order: { createdAt: 'ASC' },
    });

    const debtIds = debts.map((d) => d.id);
    const payments = debtIds.length
      ? await this.paymentRepo.find({
          where: { debtId: In(debtIds), organizationId: actor.organizationId },
          order: { createdAt: 'ASC' },
        })
      : [];

    // Resolve the Phiếu thu document numbers so collection rows show the receipt
    // number (Số chứng từ) rather than the source invoice code.
    const receiptIds = [
      ...new Set(
        payments
          .map((p) => p.cashReceiptId)
          .filter((id): id is string => !!id),
      ),
    ];
    const receipts = receiptIds.length
      ? await this.cashReceiptRepo.find({ where: { id: In(receiptIds) } })
      : [];
    const receiptNumberById = new Map(
      receipts.map((r) => [r.id, r.documentNumber ?? null] as const),
    );
    const debtById = new Map(debts.map((d) => [d.id, d] as const));

    // Resolve branch display names for the Chi nhánh column.
    const branchIds = [
      ...new Set(
        [...debts, ...payments]
          .map((r) => r.branchId)
          .filter((id): id is string => !!id),
      ),
    ];
    const branches = branchIds.length
      ? await this.branchRepo.find({
          where: { id: In(branchIds), organizationId: actor.organizationId },
        })
      : [];
    const branchNameById = new Map(branches.map((b) => [b.id, b.name] as const));
    const branchNameOf = (branchId?: string | null): string | null =>
      (branchId && branchNameById.get(branchId)) || null;

    type LedgerRow = CustomerDebtLedgerRowDto & { sortAt: number };
    const rows: LedgerRow[] = [];

    for (const d of debts) {
      rows.push({
        id: d.id,
        kind: 'debt',
        invoiceId: d.invoiceId,
        referenceCode: d.referenceCode,
        documentType: d.documentType,
        amount: Number(d.originalAmount),
        runningBalance: 0,
        issuedAt: d.issuedAt,
        createdAt: d.createdAt.toISOString(),
        branchId: d.branchId ?? null,
        branchName: branchNameOf(d.branchId),
        status: d.status,
        sortAt: d.createdAt.getTime(),
      });
    }

    for (const p of payments) {
      const debt = debtById.get(p.debtId);
      if (!debt) continue;
      const paidAt = new Date(p.paidAt);
      rows.push({
        id: p.id,
        kind: 'collection',
        invoiceId: debt.invoiceId,
        referenceCode:
          (p.cashReceiptId && receiptNumberById.get(p.cashReceiptId)) ||
          debt.referenceCode,
        documentType:
          p.paymentMethod === DebtPaymentMethod.CASH
            ? 'collect_debt_cash'
            : 'collect_debt_bank',
        amount: -Number(p.amount),
        runningBalance: 0,
        issuedAt: paidAt.toISOString().split('T')[0],
        createdAt: p.createdAt.toISOString(),
        branchId: p.branchId ?? null,
        branchName: branchNameOf(p.branchId),
        sortAt: p.createdAt.getTime(),
      });
    }

    // Oldest-first so the running balance reads top-to-bottom; a debt document
    // precedes a same-instant collection (you can't collect before it exists).
    rows.sort((a, b) => {
      if (a.sortAt !== b.sortAt) return a.sortAt - b.sortAt;
      if (a.kind !== b.kind) return a.kind === 'debt' ? -1 : 1;
      return 0;
    });

    const round = (v: number) => Math.round(v * 100) / 100;
    let balance = 0;
    return rows.map(({ sortAt: _sortAt, ...row }) => {
      balance = round(balance + row.amount);
      return { ...row, runningBalance: balance };
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
