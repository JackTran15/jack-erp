import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, JournalSource } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { JournalService } from '../journal/journal.service';
import { JournalPostSalePayload } from '../publishers/journal-sale.publisher';

interface JournalLineInput {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  lineOrder: number;
}

@Injectable()
export class JournalSaleConsumer {
  private readonly logger = new Logger(JournalSaleConsumer.name);

  constructor(private readonly journalService: JournalService) {}

  @OnDomainEvent(ERP_TOPICS.JOURNAL_POST_SALE)
  async handle(event: DomainEvent<JournalPostSalePayload>): Promise<void> {
    const {
      invoiceId,
      code,
      payments,
      remainder,
      revenueAccountId,
      receivableAccountId,
      amountDue,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    const existing = await this.journalService.findBySourceRef(invoiceId, organizationId);
    if (existing) {
      this.logger.log(
        `Skipped duplicate journal for invoice ${invoiceId} (already posted as ${existing.documentNumber})`,
      );
      return;
    }

    const lines: JournalLineInput[] = [];
    let lineOrder = 1;

    for (const payment of payments) {
      lines.push({
        accountId: payment.accountId,
        debitAmount: Number(payment.amount),
        creditAmount: 0,
        lineOrder: lineOrder++,
      });
    }

    if (remainder > 0) {
      if (!receivableAccountId) {
        throw new Error(
          `Invoice ${invoiceId} has remainder ${remainder} but no receivableAccountId in payload`,
        );
      }
      lines.push({
        accountId: receivableAccountId,
        debitAmount: Number(remainder),
        creditAmount: 0,
        lineOrder: lineOrder++,
      });
    }

    lines.push({
      accountId: revenueAccountId,
      debitAmount: 0,
      creditAmount: Number(amountDue),
      lineOrder: lineOrder,
    });

    await this.journalService.post(
      {
        source: JournalSource.SALE,
        sourceReferenceId: invoiceId,
        description: `POS Invoice ${code}`,
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
      `Posted journal entry for invoice ${invoiceId} (code=${code}, amount=${amountDue})`,
    );
  }
}
