import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { CashService } from '../../cash/cash.service';
import {
  CashMovementEntity,
  CashMovementType,
} from '../../cash/cash-movement.entity';
import { CashRefundPayload } from '../../publishers/cash-refund.publisher';
import { CashPaymentsService } from '../cash-payments/cash-payments.service';
import { CashPaymentPurpose, CashPaymentReferenceType } from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';

/**
 * POS return/exchange refund paid in cash → records the WITHDRAWAL and issues a
 * Phiếu Chi (REFUND), atomically. The movement and the voucher commit together,
 * so a re-delivered event that finds an existing movement can safely skip
 * (the voucher already exists).
 */
@Injectable()
export class RefundCashConsumer {
  private readonly logger = new Logger(RefundCashConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cashService: CashService,
    private readonly cashPaymentsService: CashPaymentsService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.CASH_REFUND, { groupId: 'erp-api.return.cash-refund' })
  async handle(event: DomainEvent<CashRefundPayload>): Promise<void> {
    const {
      returnInvoiceId,
      returnInvoiceCode,
      cashAccountId,
      contraAccountId,
      amount,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    const actor = { userId: actorId, organizationId, branchId, roles: [] };

    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(CashMovementEntity, {
        where: {
          reference: returnInvoiceCode,
          cashAccountId,
          type: CashMovementType.WITHDRAWAL,
          organizationId,
        },
      });
      if (existing) {
        this.logger.log(
          `Skipped duplicate cash refund for ${returnInvoiceCode} (movement=${existing.id})`,
        );
        return;
      }

      const { movement, journalEntryId } = await this.cashService.recordMovement(
        {
          cashAccountId,
          type: CashMovementType.WITHDRAWAL,
          amount: Number(amount),
          contraAccountId,
          reference: returnInvoiceCode,
          notes: `POS return refund: ${returnInvoiceCode}`,
        },
        actor,
        manager,
      );

      const categoryId = await this.categoryResolver.resolveId(
        organizationId,
        'CHI_KHAC',
      );

      const result = await this.cashPaymentsService.createVoucherForMovement(
        {
          cashMovementId: movement.id,
          journalEntryId,
          purpose: CashPaymentPurpose.REFUND,
          cashAccountId,
          contraAccountId,
          amount: Number(amount),
          referenceType: CashPaymentReferenceType.REFUND,
          referenceId: returnInvoiceId,
          description: `Hoàn tiền trả hàng ${returnInvoiceCode}`,
          categoryId,
          actor,
        },
        manager,
      );

      this.logger.log(
        `Cash refund ${returnInvoiceCode} → ${result.voucherNumber} (payment=${result.voucherId})`,
      );
    });
  }
}
