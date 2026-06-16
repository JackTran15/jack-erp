import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { InvoiceDebtEntity, DebtStatus } from '../entities/invoice-debt.entity';

/**
 * Flips OPEN credit debts past their due date to OVERDUE and emits a
 * `debt.overdue` event per debt. Runs cross-tenant (no org filter); each event
 * carries the org/branch so downstream consumers can scope their work.
 */
@Injectable()
export class OverdueDebtsService {
  private readonly logger = new Logger(OverdueDebtsService.name);

  constructor(
    @InjectRepository(InvoiceDebtEntity)
    private readonly debtRepo: Repository<InvoiceDebtEntity>,
    private readonly events: EventPublisher,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markOverdue(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const due = await this.debtRepo.find({
      where: { status: DebtStatus.OPEN, dueDate: LessThan(today) },
    });

    if (due.length === 0) {
      return;
    }

    for (const debt of due) {
      debt.status = DebtStatus.OVERDUE;
      await this.debtRepo.save(debt);

      await this.events.publish(
        ERP_TOPICS.DEBT_OVERDUE,
        {
          // Deterministic per debt + due date so re-runs / replays are no-ops.
          eventId: `debt-overdue-${debt.id}-${debt.dueDate}`,
          eventType: DomainEventType.DEBT_OVERDUE,
          timestamp: new Date().toISOString(),
          organizationId: debt.organizationId,
          branchId: debt.branchId,
          correlationId: debt.id,
          payload: {
            debtId: debt.id,
            invoiceId: debt.invoiceId,
            customerId: debt.customerId,
            dueDate: debt.dueDate!,
            remainingAmount: Number(debt.remainingAmount),
          },
        },
        debt.id,
      );
    }

    this.logger.log(`Marked ${due.length} debt(s) overdue`);
  }
}
