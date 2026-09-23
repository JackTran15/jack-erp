import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { PromotionProgramType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceCheckoutPromotionEntity } from '../checkout-saga/infrastructure/invoice-checkout-promotion.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import { refundableUnitValues } from './refundable-value.util';
import {
  InvoiceDebtEntity,
  DebtDocumentType,
  DebtStatus,
} from '../entities/invoice-debt.entity';

export interface OutstandingDebt {
  /** What the customer still owes on this invoice; 0 when it was paid in full. */
  remainingDebt: number;
}

/**
 * One promotion programme's share of ONE unit of an eligible line, read from
 * the original invoice's `invoice_checkout_promotions` snapshot. Lets the POS
 * label a return line "Giảm giá hàng hóa 30% (205.500)" the way the sale line
 * was labelled, without re-running the engine on a posted document.
 */
export interface EligibleLinePromotion {
  programId: string;
  code: string;
  name: string;
  type: PromotionProgramType;
  /** `lineDiscounts[].discountAmount / quantity` of the sold line, 2dp. */
  unitDiscount: number;
}

export interface EligibleLine {
  originalInvoiceItemId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  unitPrice: number;
  /**
   * What ONE unit is worth back to the customer: `unitPrice` net of the
   * promotion allocated to that line and its share of the invoice-level money
   * never paid. Equals `unitPrice` when the sale carried no discount.
   *
   * POS must price return credits on THIS, not on `unitPrice` — the checkout
   * refunds the net, so crediting the list price undercharges the exchange by
   * the discount and leaves the difference behind as phantom debt.
   */
  refundableUnitPrice: number;
  lineDiscount: number;
  locationId?: string;
  soldQuantity: number;
  returnedQuantity: number;
  maxReturnable: number;
  /**
   * Programmes the snapshot allocated to this line, in the order the engine
   * applied them. `[]` when the sale carried no snapshot (no promotion, or a
   * pre-snapshot invoice). Display only — `refundableUnitPrice` already nets
   * these out.
   */
  promotions: EligibleLinePromotion[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Both kinds carry sold (OUT) lines. An EXCHANGE's "bought extra" lines are a
 * real sale — same stock movement, same cost price, same returned-quantity
 * accumulator — so a later visit returns against that exchange itself rather
 * than against the sale two documents back.
 */
const RETURNABLE_TYPES: InvoiceType[] = [
  InvoiceType.SALE,
  InvoiceType.EXCHANGE,
];

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
    // `InvoiceCheckoutPromotionEntity` is not in PosModule's `forFeature` —
    // read through the DataSource, same as `InvoiceService.findOne`.
    private readonly dataSource: DataSource,
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

  /**
   * Returns per-line returnable amounts for the original invoice.
   *
   * Only OUT lines come back. On a SALE that is every line; on an EXCHANGE it
   * drops the goods the customer already handed back, which are not the store's
   * to refund a second time.
   */
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
    if (!RETURNABLE_TYPES.includes(invoice.type)) {
      throw new BadRequestException(
        `Invoice ${originalInvoiceId} is type ${invoice.type}, only SALE/EXCHANGE can be returned`,
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

    // Full item set — the same input `CheckoutReturnService.computeReturnedNet`
    // reads from the original invoice. The header residual is spread across
    // every line's net value, so filtering BEFORE this call would move the
    // divisor and let the preview drift away from the posted charge.
    const refundable = refundableUnitValues(invoice, items);

    // Filter the result, never the input. Unconditional rather than branching
    // on `invoice.type`: SALE lines are all OUT already, so one predicate covers
    // both kinds and there is no second path to drift.
    const returnable = items.filter((it) => it.direction === ItemDirection.OUT);

    const promotionsByLine = await this.loadLinePromotions(
      originalInvoiceId,
      items,
      actor,
    );

    return returnable.map((it) => {
      const sold = Number(it.quantity);
      const returned = Number(it.returnedQuantity ?? 0);
      return {
        originalInvoiceItemId: it.id,
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        refundableUnitPrice: refundable.get(it.id) ?? Number(it.unitPrice),
        lineDiscount: Number(it.lineDiscount ?? 0),
        locationId: it.locationId,
        soldQuantity: sold,
        returnedQuantity: returned,
        maxReturnable: Math.max(sold - returned, 0),
        promotions: promotionsByLine.get(it.id) ?? [],
      };
    });
  }

  /**
   * `invoice_items.id → programmes allocated to it`, from the original invoice's
   * checkout snapshot. Every programme type is listed (an INVOICE_DISCOUNT's
   * allocation is netted out of `refundableUnitPrice` just like an item one —
   * A-12). A snapshot row with `lineDiscounts` NULL, a `lineId` that matches no
   * item, or a zero-quantity line contributes nothing.
   */
  private async loadLinePromotions(
    invoiceId: string,
    items: InvoiceItemEntity[],
    actor: ActorContext,
  ): Promise<Map<string, EligibleLinePromotion[]>> {
    const snapshots = await this.dataSource
      .getRepository(InvoiceCheckoutPromotionEntity)
      .find({
        where: { invoiceId, organizationId: actor.organizationId },
        order: { priority: 'ASC', createdAt: 'ASC' },
      });

    const quantityByLine = new Map(items.map((it) => [it.id, Number(it.quantity)]));
    const byLine = new Map<string, EligibleLinePromotion[]>();
    for (const row of snapshots) {
      for (const ld of row.lineDiscounts ?? []) {
        const quantity = quantityByLine.get(ld.lineId);
        if (!quantity) continue;
        const list = byLine.get(ld.lineId) ?? [];
        list.push({
          programId: row.programId,
          code: row.code,
          name: row.name,
          type: row.type as PromotionProgramType,
          unitDiscount: round2(Number(ld.discountAmount) / quantity),
        });
        byLine.set(ld.lineId, list);
      }
    }
    return byLine;
  }

  /**
   * Validate that a return line may be returned at all, and not beyond its
   * remaining cap.
   *
   * `getEligibleLines` decides what POS OFFERS; this decides what the server
   * ACCEPTS. An older client — or a direct API call — can still name an inbound
   * line of an exchange, which would credit and ship goods the customer already
   * handed back. The write path is where that has to be refused (ADR-03).
   */
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
    // Before the quantity check, so the message names the real cause rather
    // than reporting an over-return.
    if (item.direction === ItemDirection.IN) {
      throw new BadRequestException(
        `Invoice line ${originalInvoiceItemId} is an inbound (returned) line and cannot be returned again`,
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
