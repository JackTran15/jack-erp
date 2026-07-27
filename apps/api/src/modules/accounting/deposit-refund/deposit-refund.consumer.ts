import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DepositMovementSource, DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';
import { BankPaymentsService } from '../deposit-vouchers/bank-payments/bank-payments.service';
import {
  BankPaymentPurpose,
  BankPaymentReferenceType,
} from '../deposit-vouchers/enums';

/**
 * Deposit-fund side of a cancelled POS invoice (FR-11). Complements
 * `JournalReverseConsumer` (which reverses the sale/revenue journal entry) by
 * paying the non-cash money back out of the fund it landed in.
 *
 * The payment voucher owns the movement (ADR-04): `createAndPostInternal`
 * writes the withdrawal, its journal entry and the voucher in one transaction.
 * The original sale movement is left alone and offset by this new one rather
 * than reversed, so a movement that has already been reconciled with the bank
 * no longer blocks the refund.
 *
 * A cash-only invoice carries no DEPOSIT leg, so this is a harmless no-op for it.
 */
@Injectable()
export class DepositRefundConsumer {
  private readonly logger = new Logger(DepositRefundConsumer.name);

  constructor(private readonly bankPayments: BankPaymentsService) {}

  @OnDomainEvent(ERP_TOPICS.INVOICE_CANCELLED, {
    groupId: 'erp-api.invoice.cancelled.deposit-refund',
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
    if (!branchId) return;

    // `refunds` is absent on events published before this feature shipped.
    const depositLegs = (refunds ?? []).filter(
      (leg) => leg.fundKind === 'DEPOSIT',
    );
    if (depositLegs.length === 0) {
      return;
    }

    // ADR-06: `createAndPostInternal` dedupes on (referenceType, referenceId),
    // so a second voucher for the same invoice would be silently swallowed and
    // one fund would keep money it no longer holds. Refusing outright sends the
    // event to the DLQ with a message an accountant can act on, which beats an
    // invisible partial refund.
    if (depositLegs.length > 1) {
      throw new ConflictException(
        `Invoice ${documentNumber} was paid into ${depositLegs.length} deposit funds; ` +
          'automatic refund supports one fund per invoice — issue the refund vouchers manually (ADR-06)',
      );
    }

    const [leg] = depositLegs;
    if (!leg.depositAccountId) {
      throw new Error(
        `Invoice ${invoiceId}: DEPOSIT refund leg without depositAccountId`,
      );
    }

    const actor = { userId: actorId, organizationId, branchId, roles: [] };

    const result = await this.bankPayments.createAndPostInternal({
      purpose: BankPaymentPurpose.REFUND,
      depositAccountId: leg.depositAccountId,
      contraAccountId: leg.contraAccountId,
      amount: Number(leg.amount),
      // BankPaymentReferenceType has no REFUND member; `purpose` already
      // carries that meaning (ADR-03).
      referenceType: BankPaymentReferenceType.INVOICE,
      referenceId: invoiceId,
      reason: `Cancelled invoice ${documentNumber}`,
      description: `Hoàn tiền hủy hóa đơn ${documentNumber}`,
      source: DepositMovementSource.POS_INVOICE,
      sourceRefLineId: `${leg.depositAccountId}-CANCEL`,
      actor,
    });

    this.logger.log(
      `Cancelled invoice ${documentNumber} → ${result.voucherNumber} ` +
        `(bank payment=${result.voucherId}, fund=${leg.depositAccountId}, amount=${leg.amount})`,
    );
  }
}
