import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { WsEventType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoiceDebtEntity, DebtStatus } from '../entities/invoice-debt.entity';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';
import { InvoiceCancelledPublisher } from '../publishers/invoice-cancelled.publisher';

const CANCELLABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.PAID,
  InvoiceStatus.DEBT,
  InvoiceStatus.PARTIAL_DEBT,
]);

@Injectable()
export class CancelInvoiceService {
  private readonly logger = new Logger(CancelInvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    private readonly dataSource: DataSource,
    private readonly promotionApplyService: PromotionApplyService,
    private readonly invoiceCancelledPublisher: InvoiceCancelledPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  async cancel(
    id: string,
    dto: CancelInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    if (!CANCELLABLE_STATUSES.has(invoice.status)) {
      throw new BadRequestException(
        `Only paid/debt/partial-debt invoices can be cancelled. Current status: ${invoice.status}`,
      );
    }

    const items = await this.itemRepo.find({ where: { invoiceId: id } });
    const hasOutstandingDebt =
      invoice.status === InvoiceStatus.DEBT ||
      invoice.status === InvoiceStatus.PARTIAL_DEBT;
    const now = new Date();

    const cancelledInvoice = await this.dataSource.transaction(async (manager) => {
      invoice.status = InvoiceStatus.CANCELLED;
      invoice.cancelledAt = now;
      invoice.cancelReason = dto.reason;
      const saved = await manager.save(invoice);

      if (hasOutstandingDebt) {
        await manager.update(
          InvoiceDebtEntity,
          { invoiceId: id, organizationId: actor.organizationId },
          { status: DebtStatus.PAID, settledAt: now },
        );
      }

      await this.promotionApplyService.revertPromotions(id, manager);

      return saved;
    });

    await this.invoiceCancelledPublisher.publish(
      {
        invoiceId: id,
        documentNumber: invoice.code,
        reason: dto.reason,
        branchId: invoice.branchId,
        items: items
          .filter((i) => i.locationId)
          .map((item) => ({
            itemId: item.itemId,
            locationId: item.locationId!,
            quantity: Number(item.quantity),
          })),
      },
      actor,
    );

    this.wsEmitter.emitToBranch(invoice.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_INVOICE_CANCELLED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: id,
      payload: {
        invoiceId: id,
        documentNumber: invoice.code,
        reason: dto.reason,
      },
    });

    this.logger.log(
      `Cancelled invoice ${id} (code=${invoice.code}, org=${actor.organizationId})`,
    );

    return cancelledInvoice;
  }
}
