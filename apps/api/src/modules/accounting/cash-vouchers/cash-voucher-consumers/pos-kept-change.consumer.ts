import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  CashVoucherCreatedPayload,
  DomainEvent,
  DomainEventType,
  KeptChangeCashPayload,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { EventPublisher } from '../../../events/event-publisher.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { CashReceiptsService } from '../cash-receipts/cash-receipts.service';
import { CashReceiptPurpose, CashReceiptReferenceType } from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';

/**
 * "Khách không lấy tiền thừa" → Phiếu thu thu nhập khác.
 *
 * The sale itself is settled at `amountDue` by {@link PosCashSaleConsumer}; this
 * consumer books only the surplus left in the drawer, so DR quỹ / CR 711 rather
 * than / CR doanh thu. The contra account is resolved here (not at checkout) so a
 * missing OTHER_INCOME default parks the money in the DLQ instead of failing the
 * sale at the counter. Replay-safe via `createAndPostInternal`, which returns the
 * existing voucher for (INVOICE_KEPT_CHANGE, invoiceId).
 */
@Injectable()
export class PosKeptChangeConsumer {
  private readonly logger = new Logger(PosKeptChangeConsumer.name);

  constructor(
    private readonly cashReceiptsService: CashReceiptsService,
    private readonly accountResolver: AccountResolverService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  @OnDomainEvent(ERP_TOPICS.CASH_VOUCHER_NEEDED_KEPT_CHANGE)
  async handle(event: DomainEvent<KeptChangeCashPayload>): Promise<void> {
    const {
      invoiceId,
      invoiceCode,
      cashAccountId,
      amount,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    const actor = { userId: actorId, organizationId, branchId, roles: [] };
    const contraAccountId = await this.accountResolver.resolveDefaultAccount(
      AccountingDefaultAccountRole.OTHER_INCOME,
      actor,
    );
    const categoryId = await this.categoryResolver.resolveId(
      organizationId,
      'THU_KHAC',
    );

    const result = await this.cashReceiptsService.createAndPostInternal({
      purpose: CashReceiptPurpose.OTHER_INCOME,
      cashAccountId,
      contraAccountId,
      amount: Number(amount),
      referenceType: CashReceiptReferenceType.INVOICE_KEPT_CHANGE,
      referenceId: invoiceId,
      reason: `Kept change ${invoiceCode}`,
      description: `Khách không lấy tiền thừa - HĐ ${invoiceCode}`,
      categoryId,
      actor,
    });

    await this.eventPublisher.publish(ERP_TOPICS.CASH_VOUCHER_CREATED, {
      eventId: uuid(),
      eventType: DomainEventType.CASH_VOUCHER_CREATED,
      timestamp: new Date().toISOString(),
      organizationId,
      branchId,
      correlationId: event.correlationId ?? uuid(),
      payload: {
        sourceType: 'POS_SALE',
        sourceId: invoiceId,
        voucherKind: 'CASH_RECEIPT',
        voucherId: result.voucherId,
        voucherNumber: result.voucherNumber,
        journalEntryId: result.journalEntryId,
        cashMovementId: result.cashMovementId,
        organizationId,
        branchId,
      } satisfies CashVoucherCreatedPayload,
    });

    this.logger.log(
      `Kept change ${invoiceCode} → ${result.voucherNumber} (receipt=${result.voucherId}, amount=${amount})`,
    );
  }
}
