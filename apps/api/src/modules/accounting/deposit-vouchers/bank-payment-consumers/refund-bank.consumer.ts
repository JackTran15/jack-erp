import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, DepositMovementSource } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { DepositRefundPayload } from '../../publishers/deposit-refund.publisher';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import { BankPaymentPurpose, BankPaymentReferenceType } from '../enums';

/**
 * POS return/exchange refund routed to a deposit fund → records a deposit
 * WITHDRAWAL, its JE (DR revenue / CR 112x) and a Phiếu chi ngân hàng (REFUND),
 * atomically. Delegates to {@link BankPaymentsService.createAndPostInternal},
 * which is idempotent both by the voucher reference `(REFUND, returnInvoiceId)`
 * and by the deposit-movement unique key `(POS_INVOICE, returnInvoiceId, 'REFUND')`,
 * so a re-delivered event is a safe no-op.
 */
@Injectable()
export class RefundBankConsumer {
  private readonly logger = new Logger(RefundBankConsumer.name);

  constructor(private readonly bankPayments: BankPaymentsService) {}

  @OnDomainEvent(ERP_TOPICS.DEPOSIT_REFUND, {
    groupId: 'erp-api.return.deposit-refund',
  })
  async handle(event: DomainEvent<DepositRefundPayload>): Promise<void> {
    const {
      returnInvoiceId,
      returnInvoiceCode,
      depositAccountId,
      contraAccountId,
      amount,
      docDate,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    const actor = { userId: actorId, organizationId, branchId, roles: [] };

    const result = await this.bankPayments.createAndPostInternal({
      purpose: BankPaymentPurpose.REFUND,
      depositAccountId,
      contraAccountId,
      amount: Number(amount),
      actor,
      docDate,
      referenceType: BankPaymentReferenceType.REFUND,
      referenceId: returnInvoiceId,
      source: DepositMovementSource.POS_INVOICE,
      sourceRefLineId: 'REFUND',
      description: `Hoàn tiền trả hàng ${returnInvoiceCode}`,
    });

    this.logger.log(
      `Deposit refund ${returnInvoiceCode} → ${result.voucherNumber} (payment=${result.voucherId}, movement=${result.depositMovementId})`,
    );
  }
}
