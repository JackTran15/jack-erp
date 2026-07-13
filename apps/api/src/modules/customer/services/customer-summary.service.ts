import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CustomerService } from '../customer.service';
import { MembershipCardEntity } from '../membership-card.entity';
import { PointHistoryEntity, PointType } from '../point-history.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../../pos/entities/invoice.entity';
import {
  InvoiceDebtEntity,
  DebtStatus,
} from '../../pos/entities/invoice-debt.entity';
import { DebtPaymentEntity } from '../../pos/entities/debt-payment.entity';
import { CustomerSummaryResponseDto } from '../dto/customer-summary.response.dto';

/** Invoice statuses that count as a committed sale for spending totals. */
const COMPLETED_SALE_STATUSES = [
  InvoiceStatus.PAID,
  InvoiceStatus.DEBT,
  InvoiceStatus.PARTIAL_DEBT,
];

/** Debt statuses that still represent money owed by the customer. */
const OUTSTANDING_DEBT_STATUSES = [DebtStatus.OPEN, DebtStatus.OVERDUE];

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Builds the customer overview ("Tổng quan") metrics in a single call so the
 * client no longer has to fan out to invoices, debts and membership endpoints.
 * Aggregation is done in-memory over the per-customer rows (small cardinality)
 * rather than via SQL GROUP BY.
 */
@Injectable()
export class CustomerSummaryService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceDebtEntity)
    private readonly debtRepo: Repository<InvoiceDebtEntity>,
    @InjectRepository(DebtPaymentEntity)
    private readonly paymentRepo: Repository<DebtPaymentEntity>,
    @InjectRepository(MembershipCardEntity)
    private readonly cardRepo: Repository<MembershipCardEntity>,
    @InjectRepository(PointHistoryEntity)
    private readonly historyRepo: Repository<PointHistoryEntity>,
    private readonly customerService: CustomerService,
  ) {}

  async getSummary(
    customerId: string,
    actor: ActorContext,
  ): Promise<CustomerSummaryResponseDto> {
    // Validates the customer exists within the actor's organization (throws otherwise).
    await this.customerService.findByIdWithMergeCheck(customerId, actor);

    const [invoices, debts, card] = await Promise.all([
      this.invoiceRepo.find({
        where: {
          customerId,
          organizationId: actor.organizationId,
          type: InvoiceType.SALE,
          status: In(COMPLETED_SALE_STATUSES),
        },
      }),
      this.debtRepo.find({
        where: {
          customerId,
          organizationId: actor.organizationId,
        },
      }),
      this.cardRepo.findOne({
        where: { customerId, organizationId: actor.organizationId },
      }),
    ]);

    // Collections (Phiếu thu) recorded against these debts count as ledger
    // documents too, so the summary's documentCount matches the Công nợ tab
    // total (debt rows + collection rows), not just outstanding debts.
    const debtIds = debts.map((d) => d.id);
    const collectionCount = debtIds.length
      ? await this.paymentRepo.count({
          where: { debtId: In(debtIds), organizationId: actor.organizationId },
        })
      : 0;

    const totalSpending = round2(
      invoices.reduce((sum, inv) => sum + Number(inv.amountDue), 0),
    );
    const totalOutstanding = round2(
      debts
        .filter((debt) => OUTSTANDING_DEBT_STATUSES.includes(debt.status))
        .reduce((sum, debt) => sum + Number(debt.remainingAmount), 0),
    );

    let membership: CustomerSummaryResponseDto['membership'] = null;
    if (card) {
      const redeemed = await this.historyRepo.find({
        where: { cardId: card.id, type: PointType.REDEEM },
      });
      const pointsUsed = redeemed.reduce(
        (sum, h) => sum + Math.abs(Number(h.delta)),
        0,
      );
      membership = {
        cardNumber: card.cardNumber,
        tier: card.tier,
        points: card.points,
        pointsUsed,
      };
    }

    return {
      customerId,
      purchases: {
        totalSpending,
        invoiceCount: invoices.length,
      },
      debt: {
        totalOutstanding,
        documentCount: debts.length + collectionCount,
      },
      membership,
    };
  }
}
