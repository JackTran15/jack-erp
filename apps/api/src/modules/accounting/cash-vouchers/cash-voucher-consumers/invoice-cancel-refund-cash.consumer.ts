import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, Not } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { InvoiceCancelledPayload } from '../../../pos/publishers/invoice-cancelled.publisher';
import {
  VoucherLinkKind,
  VoucherLinkRelation,
} from '../../voucher-links/enums';
import { VoucherLinksService } from '../../voucher-links/voucher-links.service';
import { CashReceiptEntity } from '../cash-receipts/cash-receipt.entity';
import { CashPaymentsService } from '../cash-payments/cash-payments.service';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashReceiptReferenceType,
  CashVoucherStatus,
} from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';

/**
 * Cancelled POS invoice → Phiếu Chi for the cash the customer had already
 * handed over. Sibling of {@link RefundCashConsumer} (which covers the
 * return/exchange path); the difference is that the whole invoice is voided
 * here, so the refund amount comes off the event's refund legs rather than off
 * a return document.
 *
 * The original POS_SALE receipt is deliberately left POSTED — accounting wants a
 * visible payment voucher in the treasury grid, not a silently reversed receipt
 * (ADR-01).
 *
 * Replay safety comes from `createAndPostInternal`, which returns the existing
 * voucher when one already links `(REFUND, invoiceId)`; adding a second guard
 * here would only hide that contract.
 */
@Injectable()
export class InvoiceCancelRefundCashConsumer {
  private readonly logger = new Logger(InvoiceCancelRefundCashConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cashPaymentsService: CashPaymentsService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
    private readonly voucherLinks: VoucherLinksService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.INVOICE_CANCELLED, {
    groupId: 'erp-api.invoice.cancelled.refund-cash',
  })
  async handle(event: DomainEvent<InvoiceCancelledPayload>): Promise<void> {
    const {
      invoiceId,
      documentNumber,
      branchId,
      organizationId,
      actorId,
      refunds,
    } = event.payload;

    // `refunds` is absent on events published before this feature shipped.
    const cashLegs = (refunds ?? []).filter((leg) => leg.fundKind === 'CASH');
    if (cashLegs.length === 0) {
      return;
    }

    const actor = { userId: actorId, organizationId, branchId, roles: [] };
    const categoryId = await this.categoryResolver.resolveId(
      organizationId,
      'CHI_KHAC',
    );

    for (const leg of cashLegs) {
      if (!leg.cashAccountId) {
        throw new Error(
          `Invoice ${invoiceId}: CASH refund leg without cashAccountId`,
        );
      }

      // Voucher and link commit together: a link pointing at a rolled-back
      // voucher would be worse than no link at all.
      await this.dataSource.transaction(async (manager) => {
        const result = await this.cashPaymentsService.createAndPostInternal(
          {
            purpose: CashPaymentPurpose.REFUND,
            cashAccountId: leg.cashAccountId!,
            contraAccountId: leg.contraAccountId,
            amount: Number(leg.amount),
            referenceType: CashPaymentReferenceType.REFUND,
            referenceId: invoiceId,
            reason: `Cancelled invoice ${documentNumber}`,
            description: `Hoàn tiền hủy hóa đơn ${documentNumber}`,
            categoryId,
            actor,
          },
          manager,
        );

        await this.linkToOriginalReceipt(
          manager,
          invoiceId,
          documentNumber,
          result.voucherId,
          actor,
        );

        this.logger.log(
          `Cancelled invoice ${documentNumber} → ${result.voucherNumber} ` +
            `(payment=${result.voucherId}, amount=${leg.amount})`,
        );
      });
    }
  }

  /**
   * Pair the refund with the POS_SALE receipt that took the money in, keyed on
   * the same (INVOICE, invoiceId) reference `PosCashSaleConsumer` wrote at
   * checkout.
   *
   * A missing receipt is logged and tolerated: invoices paid before the POS
   * cash receipt existed have none, and losing the cross-reference is a far
   * smaller problem than refusing to refund the customer.
   */
  private async linkToOriginalReceipt(
    manager: EntityManager,
    invoiceId: string,
    documentNumber: string,
    paymentVoucherId: string,
    actor: ActorContext,
  ): Promise<void> {
    const originalReceipt = await manager.findOne(CashReceiptEntity, {
      where: {
        organizationId: actor.organizationId,
        referenceType: CashReceiptReferenceType.INVOICE,
        referenceId: invoiceId,
        status: Not(CashVoucherStatus.REVERSED),
      },
    });

    if (!originalReceipt) {
      this.logger.warn(
        `No POS_SALE cash receipt found for cancelled invoice ${documentNumber} ` +
          `(${invoiceId}) — refund voucher created without a cross-reference`,
      );
      return;
    }

    await this.voucherLinks.link(
      {
        fromKind: VoucherLinkKind.CASH_RECEIPT,
        fromId: originalReceipt.id,
        toKind: VoucherLinkKind.CASH_PAYMENT,
        toId: paymentVoucherId,
        relation: VoucherLinkRelation.REFUNDED_BY,
        invoiceId,
        actor,
      },
      manager,
    );
  }
}
