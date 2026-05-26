import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { CashService } from '../cash/cash.service';
import { CashMovementEntity, CashMovementType } from '../cash/cash-movement.entity';
import { CashRefundPayload } from '../publishers/cash-refund.publisher';

@Injectable()
export class CashRefundConsumer {
  private readonly logger = new Logger(CashRefundConsumer.name);

  constructor(
    @InjectRepository(CashMovementEntity)
    private readonly movementRepo: Repository<CashMovementEntity>,
    private readonly cashService: CashService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.CASH_REFUND, {
    groupId: 'erp-api.return.cash-refund',
  })
  async handle(event: DomainEvent<CashRefundPayload>): Promise<void> {
    const {
      returnInvoiceCode,
      cashAccountId,
      contraAccountId,
      amount,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    const existing = await this.movementRepo.findOne({
      where: {
        reference: returnInvoiceCode,
        cashAccountId,
        type: CashMovementType.WITHDRAWAL,
        organizationId,
      },
    });
    if (existing) {
      this.logger.log(
        `Skipped duplicate cash refund for ${returnInvoiceCode} (existing id=${existing.id})`,
      );
      return;
    }

    await this.cashService.recordMovement(
      {
        cashAccountId,
        type: CashMovementType.WITHDRAWAL,
        amount: Number(amount),
        contraAccountId,
        reference: returnInvoiceCode,
        notes: `POS return refund: ${returnInvoiceCode}`,
      },
      {
        userId: actorId,
        organizationId,
        branchId,
        roles: [],
      },
    );

    this.logger.log(
      `Recorded cash refund WITHDRAWAL ${amount} for return ${returnInvoiceCode} (cashAccount=${cashAccountId})`,
    );
  }
}
