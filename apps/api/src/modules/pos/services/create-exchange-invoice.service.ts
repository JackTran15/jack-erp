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
import { resolveBranchItemLocations } from './resolve-branch-item-locations';
import {
  computeLineDiscount,
  ResolvedLineDiscount,
} from './line-discount.util';
import { CreateExchangeInvoiceDto } from '../dto/create-exchange-invoice.dto';
import { CreateInvoiceItemDto } from '../dto/create-invoice.dto';
import { ReturnInvoiceLineDto } from '../dto/create-return-invoice.dto';
import { ReturnEligibilityService } from './return-eligibility.service';
import { ItemCostSnapshotService } from '../../inventory/location/item-cost-snapshot.service';

@Injectable()
export class CreateExchangeInvoiceService {
  private readonly logger = new Logger(CreateExchangeInvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    private readonly dataSource: DataSource,
    private readonly eligibility: ReturnEligibilityService,
    private readonly itemCostSnapshot: ItemCostSnapshotService,
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

    // costPrice per return line — REGULAR mode (an originalInvoiceId is given)
    // reuses the ORIGINAL sale's cost snapshot so the returned (IN) leg reverses
    // the SAME cost that was booked at sale time. QUICK mode has no original
    // document to reference, so it falls back to the item's current purchase
    // price — the same fallback CreateReturnInvoiceService and
    // StockReturnInConsumer already use. (buildNewLineEntities handles the
    // new/OUT leg, which correctly uses the CURRENT purchase price either way.)
    const isQuick = !dto.originalInvoiceId;
    const costPriceByOriginalItemId = new Map<string, number>();
    let costPriceByItemId = new Map<string, number>();

    if (isQuick) {
      // Free-form return lines, no eligibility check. A line pointing at an
      // original sale line without an original invoice is self-contradictory —
      // reject rather than guess which half the caller meant.
      const strayLine = dto.returnLines.find((l) => l.originalInvoiceItemId);
      if (strayLine) {
        throw new BadRequestException(
          'originalInvoiceItemId is not allowed on a returnLine when originalInvoiceId is omitted',
        );
      }
      costPriceByItemId = await this.itemCostSnapshot.snapshotCosts(
        actor.organizationId,
        [...new Set(dto.returnLines.map((l) => l.itemId))],
      );
    } else {
      for (const line of dto.returnLines) {
        if (!line.originalInvoiceItemId) {
          throw new BadRequestException(
            'originalInvoiceItemId required on every returnLine',
          );
        }
        const originalItem = await this.eligibility.assertLineEligible(
          line.originalInvoiceItemId,
          line.quantity,
          actor,
        );
        costPriceByOriginalItemId.set(
          line.originalInvoiceItemId,
          Number(originalItem.costPrice ?? 0),
        );
      }
    }

    // Both legs resolve their per-line discount once, and every downstream number
    // — the two subtotals, `netAmount`, and the persisted line rows — reads that
    // one resolution. Summing gross here is what produced the 225.000 net on an
    // exchange POS displayed as 19.500: the cashier's 30% line discount lived
    // only in the browser, so the customer was asked to owe the discount.
    const resolvedReturnLines = dto.returnLines.map((line) =>
      computeLineDiscount(line),
    );
    const resolvedNewLines = dto.newLines.map((line) =>
      computeLineDiscount(line),
    );
    const returnSubtotal = resolvedReturnLines.reduce(
      (sum, d) => sum + d.lineTotal,
      0,
    );
    const newSubtotal = resolvedNewLines.reduce((sum, d) => sum + d.lineTotal, 0);
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
        originalInvoiceId: dto.originalInvoiceId ?? undefined,
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

      // Returned stock is credited back to the showroom, mirroring how a sale
      // deducts from the showroom — never to the storage warehouse the FE may
      // have sent (the quick path defaults to the highest-stock location).
      const returnItemIds = [...new Set(dto.returnLines.map((l) => l.itemId))];
      const returnShowroomLocations = await resolveBranchItemLocations(
        manager,
        returnItemIds,
        actor,
        { showroomOnly: true },
      );

      const returnItems = dto.returnLines.map((line, index) => {
        const discount = resolvedReturnLines[index];
        return manager.create(InvoiceItemEntity, {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          invoiceId: saved.id,
          itemId: line.itemId,
          locationId:
            returnShowroomLocations.get(line.itemId) ?? line.locationId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitPriceDefault: line.unitPrice,
          costPrice: line.originalInvoiceItemId
            ? costPriceByOriginalItemId.get(line.originalInvoiceItemId) ?? 0
            : costPriceByItemId.get(line.itemId) ?? 0,
          lineDiscount: discount.amount,
          lineDiscountType: discount.type ?? undefined,
          lineDiscountValue: discount.value ?? undefined,
          lineDiscountReason: discount.reason ?? undefined,
          lineTotal: discount.lineTotal,
          direction: ItemDirection.IN,
          returnedQuantity: 0,
          originalInvoiceItemId: line.originalInvoiceItemId,
          note: line.note,
          sortOrder: index,
        });
      });
      await manager.save(returnItems);

      // Resolve catalog + product location for new lines.
      const newItemEntities = await this.buildNewLineEntities(
        manager,
        saved.id,
        dto.newLines,
        resolvedNewLines,
        actor,
        dto.returnLines.length,
      );
      await manager.save(newItemEntities);

      return saved;
    });

    this.logger.log(
      `Created draft EXCHANGE invoice ${invoice.id} mode=${isQuick ? 'quick' : 'regular'} ` +
        `returnSubtotal=${returnSubtotal} newSubtotal=${newSubtotal} net=${netAmount}`,
    );

    return invoice;
  }

  private async buildNewLineEntities(
    manager: EntityManager,
    invoiceId: string,
    newLines: CreateInvoiceItemDto[],
    resolvedLines: ResolvedLineDiscount[],
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

    const itemLocationMap = await resolveBranchItemLocations(
      manager,
      itemIds,
      actor,
      { showroomOnly: true },
    );

    return newLines.map((line, index) => {
      const catalog = priceMap.get(line.itemId);
      const discount = resolvedLines[index];
      // Prefer the resolved showroom location over the FE-supplied shelf so a
      // "Mua thêm" line deducts from the showroom, like every other sale path.
      const resolvedLocationId = itemLocationMap.get(line.itemId) ?? line.locationId;
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
        lineDiscount: discount.amount,
        lineDiscountType: discount.type ?? undefined,
        lineDiscountValue: discount.value ?? undefined,
        lineDiscountReason: discount.reason ?? undefined,
        lineTotal: discount.lineTotal,
        direction: ItemDirection.OUT,
        returnedQuantity: 0,
        note: line.note,
        sortOrder: sortOffset + index,
      });
    });
  }
}
