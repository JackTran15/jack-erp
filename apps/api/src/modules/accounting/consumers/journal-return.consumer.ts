import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, JournalSource, RefundMethod } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { JournalService } from '../journal/journal.service';
import { JournalPostReturnPayload } from '../publishers/journal-return.publisher';

interface JournalLineInput {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  lineOrder: number;
}

@Injectable()
export class JournalReturnConsumer {
  private readonly logger = new Logger(JournalReturnConsumer.name);

  constructor(private readonly journalService: JournalService) {}

  @OnDomainEvent(ERP_TOPICS.JOURNAL_POST_RETURN, {
    groupId: 'erp-api.return.journal-post',
  })
  async handle(event: DomainEvent<JournalPostReturnPayload>): Promise<void> {
    const {
      returnInvoiceId,
      returnInvoiceCode,
      source,
      refundMethod,
      refundedAmount,
      netAmount,
      debtAmount,
      revenueAccountId,
      receivableAccountId,
      creditLiabilityAccountId,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    const existing = await this.journalService.findBySourceRef(
      returnInvoiceId,
      organizationId,
    );
    if (existing) {
      this.logger.log(
        `Skipped duplicate journal-return for ${returnInvoiceCode} (already posted as ${existing.documentNumber})`,
      );
      return;
    }

    const refunded = Number(refundedAmount);
    const net = Number(netAmount);
    const debt = Number(debtAmount ?? 0);
    const lines: JournalLineInput[] = [];
    let lineOrder = 1;

    // RETURN/EXCHANGE accounting (mirror of SALE):
    //   - Refund leg (when refundedAmount > 0): DR revenue / CR <method-specific>
    //   - New-purchase leg (EXCHANGE net > 0): DR cash (CASH method) / CR revenue
    //
    // Sign convention: SALE posts CR revenue + DR cash/AR. Refund reverses by
    // DR revenue (refunded amount) and CR credit_liability (STORE_CREDIT) or
    // CR receivable (OFFSET).
    //
    // CASH and BANK refunds are NOT booked here: the treasury movement created by
    // the cash/deposit refund consumer posts its own JE (JournalSource.CASH_MOVEMENT
    // / BANK_MOVEMENT = DR revenue / CR cash|112x). Booking the money leg here too
    // would double-post the GL — so journal-return only owns the legs that have no
    // treasury movement (STORE_CREDIT liability, OFFSET receivable).
    if (
      refunded > 0 &&
      (refundMethod === RefundMethod.STORE_CREDIT ||
        refundMethod === RefundMethod.OFFSET)
    ) {
      lines.push({
        accountId: revenueAccountId,
        debitAmount: refunded,
        creditAmount: 0,
        lineOrder: lineOrder++,
      });

      if (refundMethod === RefundMethod.STORE_CREDIT) {
        if (!creditLiabilityAccountId) {
          throw new Error(
            `journal-return ${returnInvoiceCode}: STORE_CREDIT without creditLiabilityAccountId`,
          );
        }
        lines.push({
          accountId: creditLiabilityAccountId,
          debitAmount: 0,
          creditAmount: refunded,
          lineOrder: lineOrder++,
        });
      } else {
        // OFFSET
        if (!receivableAccountId) {
          throw new Error(
            `journal-return ${returnInvoiceCode}: OFFSET without receivableAccountId`,
          );
        }
        lines.push({
          accountId: receivableAccountId,
          debitAmount: 0,
          creditAmount: refunded,
          lineOrder: lineOrder++,
        });
      }
    }

    // EXCHANGE net > 0: customer owes the difference. The cash portion (DR cash /
    // CR revenue) is booked by the cash-from-payment consumer; here we only book
    // the portion put on customer debt: DR receivable / CR revenue.
    if (net > 0 && debt > 0) {
      if (!receivableAccountId) {
        throw new Error(
          `journal-return ${returnInvoiceCode}: EXCHANGE net>0 debt without receivableAccountId`,
        );
      }
      lines.push({
        accountId: receivableAccountId,
        debitAmount: debt,
        creditAmount: 0,
        lineOrder: lineOrder++,
      });
      lines.push({
        accountId: revenueAccountId,
        debitAmount: 0,
        creditAmount: debt,
        lineOrder: lineOrder++,
      });
    }

    if (lines.length === 0) {
      this.logger.log(
        `journal-return ${returnInvoiceCode}: money leg owned by the cash/deposit movement (method=${refundMethod}) — no separate journal entry`,
      );
      return;
    }

    await this.journalService.post(
      {
        source: source === 'EXCHANGE' ? JournalSource.EXCHANGE : JournalSource.RETURN,
        sourceReferenceId: returnInvoiceId,
        description: `POS ${source} ${returnInvoiceCode}`,
        lines,
      },
      {
        userId: actorId,
        organizationId,
        branchId,
        roles: [],
      },
    );

    this.logger.log(
      `Posted journal-return for ${returnInvoiceCode} (method=${refundMethod}, refunded=${refunded}, net=${net})`,
    );
  }
}
