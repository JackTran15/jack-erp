import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { DepositMovementSource, DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';
import { BankPaymentEntity } from '../deposit-vouchers/bank-payments/bank-payment.entity';
import { BankReceiptsService } from '../deposit-vouchers/bank-receipts/bank-receipts.service';
import {
  BankPaymentReferenceType,
  BankReceiptPurpose,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../deposit-vouchers/enums';

/**
 * Cancelled POS return/exchange whose refund went to a bank fund → Phiếu Thu
 * ngân hàng putting that money back.
 *
 * The fund is read off the Phiếu Chi the refund created rather than taken from
 * the event: the invoice only records *that* it refunded by bank, never which
 * account it left from, and the voucher is the one place that fact is stored.
 *
 * The original payment voucher stays POSTED and is offset by this receipt rather
 * than reversed, so a movement already reconciled with the bank does not block
 * the collection (same reasoning as {@link DepositRefundConsumer}).
 */
@Injectable()
export class InvoiceCancelCollectDepositConsumer {
  private readonly logger = new Logger(InvoiceCancelCollectDepositConsumer.name);

  constructor(
    @InjectRepository(BankPaymentEntity)
    private readonly bankPaymentRepo: Repository<BankPaymentEntity>,
    private readonly bankReceipts: BankReceiptsService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.INVOICE_CANCELLED, {
    groupId: 'erp-api.invoice.cancelled.collect-deposit',
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
    if (!branchId) return;

    // `collections` is absent on events published before returns became
    // cancellable, and empty on every cancelled sale.
    const depositLegs = (collections ?? []).filter(
      (leg) => leg.fundKind === 'DEPOSIT',
    );
    if (depositLegs.length === 0) {
      return;
    }

    const refundVoucher = await this.bankPaymentRepo.findOne({
      where: {
        organizationId,
        referenceType: BankPaymentReferenceType.REFUND,
        referenceId: invoiceId,
        status: Not(BankVoucherStatus.REVERSED),
      },
    });
    if (!refundVoucher) {
      // Refusing sends the event to the DLQ with a message an accountant can act
      // on. Guessing a fund would put the money in the wrong place, which is far
      // worse than an operator having to write the receipt by hand.
      throw new Error(
        `Cancelled return ${documentNumber} (${invoiceId}): no bank refund voucher found — ` +
          'issue the Phiếu Thu ngân hàng manually',
      );
    }

    const actor = { userId: actorId, organizationId, branchId, roles: [] };

    for (const leg of depositLegs) {
      const result = await this.bankReceipts.createAndPostInternal({
        purpose: BankReceiptPurpose.OTHER,
        depositAccountId: refundVoucher.depositAccountId,
        contraAccountId: leg.contraAccountId,
        amount: Number(leg.amount),
        referenceType: BankReceiptReferenceType.RETURN_CANCEL,
        referenceId: invoiceId,
        reason: `Cancelled return ${documentNumber}`,
        description: `Thu lại tiền hoàn khi huỷ phiếu đổi trả ${documentNumber}`,
        source: DepositMovementSource.POS_INVOICE,
        sourceRefLineId: `${refundVoucher.depositAccountId}-CANCEL-RETURN`,
        actor,
      });

      this.logger.log(
        `Cancelled return ${documentNumber} → ${result.voucherNumber} ` +
          `(bank receipt=${result.voucherId}, fund=${refundVoucher.depositAccountId}, ` +
          `amount=${leg.amount})`,
      );
    }
  }
}
