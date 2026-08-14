import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { InvoiceCancelledPayload } from '../../../pos/publishers/invoice-cancelled.publisher';
import { CashReceiptsService } from '../cash-receipts/cash-receipts.service';
import {
  CashReceiptPurpose,
  CashReceiptReferenceType,
} from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';

/**
 * Cancelled POS return/exchange → Phiếu Thu for the cash that was refunded to
 * the customer and now comes back over the counter.
 *
 * The exact mirror of {@link InvoiceCancelRefundCashConsumer}: that one pays out
 * what a cancelled sale had collected, this one collects what a cancelled refund
 * had paid out. A cancelled sale carries no collection leg, so this is a no-op
 * for it.
 *
 * The original REFUND payment voucher is deliberately left POSTED and offset by
 * this receipt rather than reversed — same treasury convention as ADR-01.
 * Replay safety comes from `createAndPostInternal`, which returns the existing
 * voucher when one already links `(REVERSAL, invoiceId)`.
 */
@Injectable()
export class InvoiceCancelCollectCashConsumer {
  private readonly logger = new Logger(InvoiceCancelCollectCashConsumer.name);

  constructor(
    private readonly cashReceiptsService: CashReceiptsService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.INVOICE_CANCELLED, {
    groupId: 'erp-api.invoice.cancelled.collect-cash',
  })
  async handle(event: DomainEvent<InvoiceCancelledPayload>): Promise<void> {
    const {
      invoiceId,
      documentNumber,
      branchId,
      organizationId,
      actorId,
      collections,
    } = event.payload;

    // `collections` is absent on events published before returns became
    // cancellable, and empty on every cancelled sale.
    const cashLegs = (collections ?? []).filter(
      (leg) => leg.fundKind === 'CASH',
    );
    if (cashLegs.length === 0) {
      return;
    }

    const actor = { userId: actorId, organizationId, branchId, roles: [] };
    const categoryId = await this.categoryResolver.resolveId(
      organizationId,
      'THU_KHAC',
    );

    for (const leg of cashLegs) {
      if (!leg.cashAccountId) {
        throw new Error(
          `Invoice ${invoiceId}: CASH collection leg without cashAccountId`,
        );
      }

      const result = await this.cashReceiptsService.createAndPostInternal({
        purpose: CashReceiptPurpose.OTHER,
        cashAccountId: leg.cashAccountId,
        contraAccountId: leg.contraAccountId,
        amount: Number(leg.amount),
        referenceType: CashReceiptReferenceType.RETURN_CANCEL,
        referenceId: invoiceId,
        reason: `Cancelled return ${documentNumber}`,
        description: `Thu lại tiền hoàn khi huỷ phiếu đổi trả ${documentNumber}`,
        categoryId,
        actor,
      });

      this.logger.log(
        `Cancelled return ${documentNumber} → ${result.voucherNumber} ` +
          `(receipt=${result.voucherId}, amount=${leg.amount})`,
      );
    }
  }
}
