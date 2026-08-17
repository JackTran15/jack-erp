import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import {
  InvoiceDebtEntity,
  DebtDocumentType,
  DebtStatus,
} from '../entities/invoice-debt.entity';

export interface OutstandingDebt {
  /** What the customer still owes on this invoice; 0 when it was paid in full. */
  remainingDebt: number;
}

export interface EligibleLine {
  originalInvoiceItemId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  unitPrice: number;
  lineDiscount: number;
  locationId?: string;
  soldQuantity: number;
  returnedQuantity: number;
  maxReturnable: number;
}

const RETURNABLE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.PAID,
  InvoiceStatus.DEBT,
  InvoiceStatus.PARTIAL_DEBT,
];

@Injectable()
export class ReturnEligibilityService {
  private readonly logger = new Logger(ReturnEligibilityService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoiceDebtEntity)
    private readonly debtRepo: Repository<InvoiceDebtEntity>,
  ) {}

  /**
   * Outstanding debt on a SALE invoice, for the POS refund preview.
   *
   * The checkout applies `min(refund, remainingDebt)` against this same row under
   * a lock, so what this returns is advisory: a concurrent debt receipt can move
   * it between the preview and the post. The posted document is authoritative.
   */
  async getOutstandingDebt(
    invoiceId: string,
    actor: ActorContext,
  ): Promise<OutstandingDebt> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    const debt = await this.debtRepo.findOne({
      where: {
        invoiceId,
        organizationId: actor.organizationId,
        documentType: DebtDocumentType.CREDIT_INVOICE,
      },
    });
    if (!debt || debt.status === DebtStatus.PAID) {
      return { remainingDebt: 0 };
    }
    // Historical rows can carry a negative remainder; treat it as settled rather
    // than letting a negative propagate into the split arithmetic.
    return { remainingDebt: Math.max(0, Number(debt.remainingAmount)) };
  }

  /** Returns per-line returnable amounts for the original SALE invoice. */
  async getEligibleLines(
    originalInvoiceId: string,
    actor: ActorContext,
  ): Promise<EligibleLine[]> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: originalInvoiceId, organizationId: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${originalInvoiceId} not found`);
    }
    if (invoice.type !== InvoiceType.SALE) {
      throw new BadRequestException(
        `Invoice ${originalInvoiceId} is type ${invoice.type}, only SALE can be returned`,
      );
    }
    if (!RETURNABLE_STATUSES.includes(invoice.status)) {
      throw new BadRequestException(
        `Invoice ${originalInvoiceId} status ${invoice.status} is not returnable`,
      );
    }

    const items = await this.itemRepo.find({
      where: { invoiceId: originalInvoiceId },
      order: { sortOrder: 'ASC' },
    });

    return items.map((it) => {
      const sold = Number(it.quantity);
      const returned = Number(it.returnedQuantity ?? 0);
      return {
        originalInvoiceItemId: it.id,
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        lineDiscount: Number(it.lineDiscount ?? 0),
        locationId: it.locationId,
        soldQuantity: sold,
        returnedQuantity: returned,
        maxReturnable: Math.max(sold - returned, 0),
      };
    });
  }

  /** Validate that a regular return line does not exceed its remaining returnable cap. */
  async assertLineEligible(
    originalInvoiceItemId: string,
    requestedQty: number,
    actor: ActorContext,
  ): Promise<InvoiceItemEntity> {
    const item = await this.itemRepo.findOne({
      where: { id: originalInvoiceItemId, organizationId: actor.organizationId },
    });
    if (!item) {
      throw new NotFoundException(
        `Original invoice item ${originalInvoiceItemId} not found`,
      );
    }
    const max = Number(item.quantity) - Number(item.returnedQuantity ?? 0);
    if (requestedQty <= 0) {
      throw new BadRequestException(
        `Số lượng trả phải > 0 (item=${originalInvoiceItemId})`,
      );
    }
    if (requestedQty > max) {
      throw new BadRequestException(
        `Vượt quá số lượng trả được cho item ${originalInvoiceItemId} (max=${max}, requested=${requestedQty})`,
      );
    }
    return item;
  }
}
