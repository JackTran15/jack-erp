import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, EntityManager } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ProductStorageLocationEntity } from '../../inventory/product/product-storage-location.entity';
import { CreateExchangeInvoiceDto } from '../dto/create-exchange-invoice.dto';
import { CreateInvoiceItemDto } from '../dto/create-invoice.dto';
import { ReturnInvoiceLineDto } from '../dto/create-return-invoice.dto';
import { ReturnEligibilityService } from './return-eligibility.service';

@Injectable()
export class CreateExchangeInvoiceService {
  private readonly logger = new Logger(CreateExchangeInvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    private readonly dataSource: DataSource,
    private readonly eligibility: ReturnEligibilityService,
  ) {}

  async create(
    dto: CreateExchangeInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    if (dto.returnLines.length === 0) {
      throw new BadRequestException('EXCHANGE requires at least one returnLine');
    }
    if (dto.newLines.length === 0) {
      throw new BadRequestException('EXCHANGE requires at least one newLine');
    }

    // Validate return lines against the original SALE invoice.
    for (const line of dto.returnLines) {
      if (!line.originalInvoiceItemId) {
        throw new BadRequestException(
          'originalInvoiceItemId required on every returnLine',
        );
      }
      await this.eligibility.assertLineEligible(
        line.originalInvoiceItemId,
        line.quantity,
        actor,
      );
    }

    const returnSubtotal = dto.returnLines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice - (l.lineDiscount ?? 0),
      0,
    );
    const newSubtotal = dto.newLines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice - (l.lineDiscount ?? 0),
      0,
    );
    const netAmount = Number((newSubtotal - returnSubtotal).toFixed(2));
    const refundedAmount = Math.max(returnSubtotal - newSubtotal, 0);

    const invoice = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(InvoiceEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        code: `DRAFT-${uuid().slice(0, 8)}`,
        sessionId: dto.sessionId,
        customerId: dto.customerId,
        type: InvoiceType.EXCHANGE,
        originalInvoiceId: dto.originalInvoiceId,
        isDraft: true,
        status: InvoiceStatus.DRAFT,
        staffId: actor.userId,
        subtotal: newSubtotal,
        discountAmount: 0,
        depositAmount: 0,
        amountDue: Math.max(netAmount, 0),
        refundedAmount,
        netAmount,
        note: dto.reason,
      });
      const saved = await manager.save(entity);

      const returnItems = dto.returnLines.map((line, index) =>
        manager.create(InvoiceItemEntity, {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          invoiceId: saved.id,
          itemId: line.itemId,
          locationId: line.locationId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitPriceDefault: line.unitPrice,
          costPrice: 0,
          lineDiscount: line.lineDiscount ?? 0,
          lineTotal: line.quantity * line.unitPrice - (line.lineDiscount ?? 0),
          direction: ItemDirection.IN,
          returnedQuantity: 0,
          originalInvoiceItemId: line.originalInvoiceItemId,
          note: line.note,
          sortOrder: index,
        }),
      );
      await manager.save(returnItems);

      // Resolve catalog + product location for new lines.
      const newItemEntities = await this.buildNewLineEntities(
        manager,
        saved.id,
        dto.newLines,
        actor,
        dto.returnLines.length,
      );
      await manager.save(newItemEntities);

      return saved;
    });

    this.logger.log(
      `Created draft EXCHANGE invoice ${invoice.id} returnSubtotal=${returnSubtotal} newSubtotal=${newSubtotal} net=${netAmount}`,
    );

    return invoice;
  }

  private async buildNewLineEntities(
    manager: EntityManager,
    invoiceId: string,
    newLines: CreateInvoiceItemDto[],
    actor: ActorContext,
    sortOffset: number,
  ): Promise<InvoiceItemEntity[]> {
    const itemIds = [...new Set(newLines.map((l) => l.itemId))];
    const catalogItems = await manager.findBy(ItemEntity, {
      id: In(itemIds),
      organizationId: actor.organizationId,
    });
    const priceMap = new Map(catalogItems.map((c) => [c.id, c]));
    const missing = itemIds.filter((id) => !priceMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Items not found in this organisation: ${missing.join(', ')}`,
      );
    }

    const productIds = [
      ...new Set(
        catalogItems.map((c) => c.productId).filter((p): p is string => !!p),
      ),
    ];
    const locRows =
      productIds.length > 0
        ? await manager.findBy(ProductStorageLocationEntity, {
            productId: In(productIds),
          })
        : [];
    const productLocationMap = new Map(
      locRows.map((r) => [r.productId, r.locationId]),
    );

    return newLines.map((line, index) => {
      const catalog = priceMap.get(line.itemId);
      const resolvedLocationId =
        line.locationId ??
        (catalog?.productId ? productLocationMap.get(catalog.productId) : undefined);
      return manager.create(InvoiceItemEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        invoiceId,
        itemId: line.itemId,
        locationId: resolvedLocationId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitPriceDefault: catalog?.sellingPrice ?? 0,
        costPrice: catalog?.purchasePrice ?? 0,
        lineDiscount: line.lineDiscount ?? 0,
        lineTotal: line.quantity * line.unitPrice - (line.lineDiscount ?? 0),
        direction: ItemDirection.OUT,
        returnedQuantity: 0,
        note: line.note,
        sortOrder: sortOffset + index,
      });
    });
  }
}
