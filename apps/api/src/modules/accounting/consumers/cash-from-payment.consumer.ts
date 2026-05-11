import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { CashService } from '../cash/cash.service';
import {
  CashMovementEntity,
  CashMovementType,
} from '../cash/cash-movement.entity';
import { CashMovementFromPaymentPayload } from '../publishers/cash-from-payment.publisher';

@Injectable()
export class CashFromPaymentConsumer {
  private readonly logger = new Logger(CashFromPaymentConsumer.name);

  constructor(
    @InjectRepository(CashMovementEntity)
    private readonly movementRepo: Repository<CashMovementEntity>,
    private readonly cashService: CashService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.CASH_MOVEMENT_FROM_PAYMENT)
  async handle(event: DomainEvent<CashMovementFromPaymentPayload>): Promise<void> {
    const {
      invoiceCode,
      cashAccountId,
      contraAccountId,
      amount,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    const existing = await this.movementRepo.findOne({
      where: {
        reference: invoiceCode,
        cashAccountId,
        type: CashMovementType.DEPOSIT,
        organizationId,
      },
    });
    if (existing) {
      this.logger.log(
        `Skipped duplicate cash movement for invoice ${invoiceCode} (existing id=${existing.id})`,
      );
      return;
    }

    await this.cashService.recordMovement(
      {
        cashAccountId,
        type: CashMovementType.DEPOSIT,
        amount,
        contraAccountId,
        reference: invoiceCode,
        notes: `POS sale: ${invoiceCode}`,
      },
      {
        userId: actorId,
        organizationId,
        branchId,
        roles: [],
      },
    );

    this.logger.log(
      `Recorded cash movement DEPOSIT ${amount} from invoice ${invoiceCode} (cashAccount=${cashAccountId})`,
    );
  }
}
