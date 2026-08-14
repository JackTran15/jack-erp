import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { CustomerCreditStatus, WsEventType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../accounting/payment-accounts/enums';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import { CustomerCreditEntity } from '../../customer/customer-credit.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
  RefundMethod,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import {
  InvoiceDebtEntity,
  DebtDocumentType,
  DebtStatus,
} from '../entities/invoice-debt.entity';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';
import {
  InvoiceCancelledCollectionLeg,
  InvoiceCancelledPublisher,
} from '../publishers/invoice-cancelled.publisher';
import { InvoiceRefundLegsService } from './invoice-refund-legs.service';

const RETURN_INVOICE_TYPES: ReadonlySet<InvoiceType> = new Set([
  InvoiceType.RETURN,
  InvoiceType.EXCHANGE,
]);

/** Mirrors `CANCELLABLE_STATUSES` in cancel-invoice.service — drafts moved nothing. */
const CANCELLABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.PAID,
  InvoiceStatus.DEBT,
  InvoiceStatus.PARTIAL_DEBT,
]);

/**
 * Voids a posted RETURN/EXCHANGE — the mirror of {@link CheckoutReturnService}.
 *
 * Every leg that flow moved has to move back, and most of them the other way
 * round from a cancelled sale: goods the customer handed in go back out to them,
 * money refunded is collected again, and the original sale's returned quantities
 * and debt are restored so it behaves as if the return never happened (which is
 * also what makes it cancellable again — `assertNoSettledReturns` only counts
 * returns that are not CANCELLED).
 *
 * Legs that cannot be undone cleanly are refused up front rather than half
 * applied: a store credit the customer has already spent, and an exchange debt
 * they have already started paying.
 */
@Injectable()
export class CancelReturnService {
  private readonly logger = new Logger(CancelReturnService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    private readonly dataSource: DataSource,
    private readonly invoiceCancelledPublisher: InvoiceCancelledPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
    private readonly refundLegs: InvoiceRefundLegsService,
    private readonly accountResolver: AccountResolverService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly membershipCardService: MembershipCardService,
  ) {}

  async cancel(
    id: string,
    dto: CancelInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    if (!RETURN_INVOICE_TYPES.has(invoice.type)) {
      throw new BadRequestException(
        `Hóa đơn ${invoice.code} là ${invoice.type} — dùng huỷ hóa đơn bán.`,
      );
    }
    if (!CANCELLABLE_STATUSES.has(invoice.status)) {
      throw new BadRequestException(
        `Chỉ huỷ được phiếu đã hoàn tất. Trạng thái hiện tại: ${invoice.status}`,
      );
    }

    const items = await this.itemRepo.find({ where: { invoiceId: id } });
    const originalInvoice = invoice.originalInvoiceId
      ? await this.invoiceRepo.findOne({
          where: {
            id: invoice.originalInvoiceId,
            organizationId: actor.organizationId,
          },
        })
      : null;

    // Fund resolution happens before the transaction on purpose: a branch with
    // no cash fund is a configuration error, and failing here leaves the
    // document untouched rather than emitting an event no consumer can honour.
    const contraAccountId = await this.accountResolver.resolveDefaultAccount(
      AccountingDefaultAccountRole.REVENUE,
      actor,
    );
    const collections = await this.buildCollectionLegs(
      invoice,
      contraAccountId,
      actor,
    );
    // An exchange may also have collected a top-up; that money goes back out the
    // same way a cancelled sale's takings do, so the existing refund legs apply.
    const refunds = await this.refundLegs.build(invoice, actor);

    const now = new Date();

    const cancelled = await this.dataSource.transaction(async (manager) => {
      // The two refusals live inside the transaction, under a row lock: a
      // cashier drawing on the credit or collecting the exchange debt in the
      // same moment would otherwise slip between an unlocked check and the
      // write that voids it, and the money would vanish silently.
      const credit = await this.lockRevocableCredit(manager, invoice, actor);
      const exchangeDebt = await this.lockVoidableExchangeDebt(
        manager,
        invoice,
        actor,
      );

      invoice.status = InvoiceStatus.CANCELLED;
      invoice.cancelledAt = now;
      invoice.cancelReason = dto.reason;
      // `pointsEarned` / `pointsReversed` are deliberately left alone: they are
      // this document's own record of what it did, and the receipt of a voided
      // return should still show it. The card is put back below instead.
      const saved = await manager.save(invoice);

      await this.restoreReturnedQuantities(manager, items, actor);
      await this.restoreOriginalDebt(manager, invoice, originalInvoice, now);

      if (exchangeDebt) {
        exchangeDebt.remainingAmount = 0;
        exchangeDebt.status = DebtStatus.PAID;
        exchangeDebt.settledAt = now;
        exchangeDebt.note = `Huỷ phiếu đổi trả ${invoice.code}`;
        await manager.save(exchangeDebt);
      }
      if (credit) {
        await manager.softRemove(credit);
      }

      await this.reverseLoyalty(manager, invoice, actor);

      return saved;
    });

    await this.invoiceCancelledPublisher.publish(
      {
        invoiceId: id,
        documentNumber: invoice.code,
        reason: dto.reason,
        branchId: invoice.branchId,
        items: items
          .filter((i) => i.locationId)
          .map((item) => ({
            itemId: item.itemId,
            locationId: item.locationId!,
            quantity: Number(item.quantity),
            direction: item.direction,
          })),
        refunds,
        collections,
      },
      actor,
    );

    this.wsEmitter.emitToBranch(invoice.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_INVOICE_CANCELLED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: id,
      payload: {
        invoiceId: id,
        documentNumber: invoice.code,
        reason: dto.reason,
      },
    });

    this.logger.log(
      `Cancelled ${invoice.type} ${invoice.code} (org=${actor.organizationId}, ` +
        `collectLegs=${collections.length}, refundLegs=${refunds.length})`,
    );

    return cancelled;
  }

  // ─── guards ──────────────────────────────────────────────────────────────

  /**
   * The store credit this return issued, when it is still untouched. A credit
   * the customer has already drawn on cannot be revoked — that value now sits in
   * another invoice, and clawing it back would leave that one underpaid.
   */
  private async lockRevocableCredit(
    manager: EntityManager,
    invoice: InvoiceEntity,
    actor: ActorContext,
  ): Promise<CustomerCreditEntity | null> {
    if (invoice.refundMethod !== RefundMethod.STORE_CREDIT) return null;

    const credit = await manager.findOne(CustomerCreditEntity, {
      where: { sourceInvoiceId: invoice.id, organizationId: actor.organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!credit) return null;

    if (
      Number(credit.usedAmount) > 0 ||
      credit.status !== CustomerCreditStatus.OPEN
    ) {
      throw new BadRequestException(
        `Phiếu ${invoice.code} đã phát hành credit ${credit.referenceCode} và khách đã sử dụng — ` +
          'không huỷ được. Xử lý phần credit trước.',
      );
    }
    return credit;
  }

  /**
   * The customer debt an EXCHANGE with a positive net booked, when nothing has
   * been collected against it yet. A debt already being paid off has receipts
   * pointing at it, so voiding it silently would strand them.
   */
  private async lockVoidableExchangeDebt(
    manager: EntityManager,
    invoice: InvoiceEntity,
    actor: ActorContext,
  ): Promise<InvoiceDebtEntity | null> {
    const debt = await manager.findOne(InvoiceDebtEntity, {
      where: {
        invoiceId: invoice.id,
        organizationId: actor.organizationId,
        documentType: DebtDocumentType.CREDIT_INVOICE,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!debt) return null;

    if (Number(debt.paidAmount) > 0) {
      throw new BadRequestException(
        `Phiếu ${invoice.code} đã thu ${debt.paidAmount} công nợ đổi hàng — ` +
          'không huỷ được. Hoàn khoản đã thu trước.',
      );
    }
    return debt;
  }

  // ─── mirror steps ────────────────────────────────────────────────────────

  /**
   * Give the returned quantity back to the original SALE lines, so the customer
   * can return those goods again. The `>= $1` predicate is the mirror of the
   * `+ $1 <= quantity` guard the return applied, and catches the same race.
   */
  private async restoreReturnedQuantities(
    manager: EntityManager,
    items: InvoiceItemEntity[],
    actor: ActorContext,
  ): Promise<void> {
    const inLines = items.filter(
      (it) => it.direction === ItemDirection.IN && it.originalInvoiceItemId,
    );
    for (const line of inLines) {
      const qty = Number(line.quantity);
      const result = await manager.query(
        `UPDATE invoice_items
            SET returned_quantity = returned_quantity - $1
          WHERE id = $2
            AND organization_id = $3
            AND returned_quantity >= $1`,
        [qty, line.originalInvoiceItemId, actor.organizationId],
      );
      const rowCount =
        Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
      if (rowCount !== 1) {
        throw new ConflictException(
          `Không hoàn được số lượng đã trả cho line ${line.originalInvoiceItemId}`,
        );
      }
    }
  }

  /**
   * Put back the debt an OFFSET return settled on the original sale. The amount
   * comes off the ADJUSTMENT row the return wrote, not `refundedAmount` — the
   * offset is capped at what was still owed, so those two differ whenever the
   * refund was larger than the remaining debt.
   */
  private async restoreOriginalDebt(
    manager: EntityManager,
    invoice: InvoiceEntity,
    originalInvoice: InvoiceEntity | null,
    now: Date,
  ): Promise<void> {
    if (invoice.refundMethod !== RefundMethod.OFFSET || !originalInvoice) return;

    const adjustment = await manager.findOne(InvoiceDebtEntity, {
      where: {
        invoiceId: invoice.id,
        organizationId: invoice.organizationId,
        documentType: DebtDocumentType.ADJUSTMENT,
      },
    });
    // No adjustment row means the OFFSET found nothing to settle and fell back
    // to a cash refund, which the collection legs already cover.
    if (!adjustment) return;

    const applied = Math.abs(Number(adjustment.originalAmount));
    const debt = await manager.findOne(InvoiceDebtEntity, {
      where: {
        invoiceId: originalInvoice.id,
        organizationId: invoice.organizationId,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (debt) {
      const paidAmount = Number((Number(debt.paidAmount) - applied).toFixed(2));
      const remainingAmount = Number(
        (Number(debt.originalAmount) - paidAmount).toFixed(2),
      );
      debt.paidAmount = paidAmount;
      debt.remainingAmount = remainingAmount;
      if (remainingAmount > 0) {
        debt.status = DebtStatus.OPEN;
        // The debt owes money again, so it is no longer settled. `save()` skips
        // undefined, which is why this is an explicit null.
        debt.settledAt = null;
      }
      await manager.save(debt);
    }

    await manager.remove(adjustment);
  }

  /**
   * Take the card back to where it stood before this document. The net of every
   * point_history row keyed on it is exactly what it applied — earn on the new
   * goods, reversal on the returned ones, and the re-credit of points the
   * original sale had redeemed — so negating that sum undoes all three at once,
   * including any clamping the reversal consumer had to do.
   *
   * Reads the ledger rather than the invoice's own snapshots because the earn
   * and reversal are applied by consumers: what actually landed is the only
   * thing safe to take back.
   */
  private async reverseLoyalty(
    manager: EntityManager,
    invoice: InvoiceEntity,
    actor: ActorContext,
  ): Promise<void> {
    if (!invoice.customerId) return;

    const netApplied = await this.membershipCardService.netPointsForInvoice(
      invoice.id,
      manager,
      actor,
    );
    if (netApplied === 0) return;

    await this.membershipCardService.adjustPointsForVoid(
      {
        customerId: invoice.customerId,
        delta: -netApplied,
        invoiceId: invoice.id,
        note: `Huỷ phiếu đổi trả ${invoice.code}`,
      },
      manager,
      actor,
    );
  }

  /**
   * Money to collect back off the customer: what this document refunded them.
   *
   * STORE_CREDIT and OFFSET moved no money — the credit row and the original
   * sale's debt are put back inside the transaction instead — so they produce no
   * leg here.
   */
  private async buildCollectionLegs(
    invoice: InvoiceEntity,
    contraAccountId: string,
    actor: ActorContext,
  ): Promise<InvoiceCancelledCollectionLeg[]> {
    const refunded = Number(invoice.refundedAmount);
    if (refunded <= 0) return [];

    if (invoice.refundMethod === RefundMethod.CASH) {
      const cashAccountId = await this.cashFundResolver.resolveBranchCashFund(
        actor.organizationId,
        invoice.branchId,
      );
      return [
        { fundKind: 'CASH', cashAccountId, amount: refunded, contraAccountId },
      ];
    }

    if (invoice.refundMethod === RefundMethod.BANK) {
      return [{ fundKind: 'DEPOSIT', amount: refunded, contraAccountId }];
    }

    return [];
  }
}
