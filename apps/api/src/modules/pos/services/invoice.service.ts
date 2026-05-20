import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ProductStorageLocationEntity } from '../../inventory/product/product-storage-location.entity';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateInvoiceDto, actor: ActorContext): Promise<InvoiceEntity> {
    const tempCode = `DRAFT-${Date.now()}`;

    const invoice = await this.dataSource.transaction(async (manager) => {
      const items = dto.items ?? [];
      const lineTotals = items.map(
        (i) => i.quantity * i.unitPrice - (i.lineDiscount ?? 0),
      );
      const subtotal = lineTotals.reduce((sum, t) => sum + t, 0);

      const invoiceEntity = manager.create(InvoiceEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        code: tempCode,
        sessionId: dto.sessionId,
        customerId: dto.customerId,
        draftLabel: dto.draftLabel,
        note: dto.note,
        isDraft: true,
        status: InvoiceStatus.DRAFT,
        subtotal,
        discountAmount: 0,
        depositAmount: 0,
        amountDue: subtotal,
        staffId: actor.userId,
      });

      const savedInvoice = await manager.save(invoiceEntity);

      if (items.length > 0) {
        const itemIds = [...new Set(items.map((i) => i.itemId))];
        const catalogItems = await manager.findBy(ItemEntity, { id: In(itemIds), organizationId: actor.organizationId });
        const priceMap = new Map(catalogItems.map((c) => [c.id, c]));
        const missingIds = itemIds.filter((cid) => !priceMap.has(cid));
        if (missingIds.length > 0) {
          throw new BadRequestException(`Items not found in this organisation: ${missingIds.join(', ')}`);
        }

        const productLocationMap = await this.resolveProductLocations(manager, catalogItems);

        const itemEntities = items.map((item, index) => {
          const catalog = priceMap.get(item.itemId);
          const productId = catalog?.productId;
          const resolvedLocationId =
            item.locationId ?? (productId ? productLocationMap.get(productId) : undefined);
          return manager.create(InvoiceItemEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            invoiceId: savedInvoice.id,
            itemId: item.itemId,
            locationId: resolvedLocationId,
            itemCode: item.itemCode,
            itemName: item.itemName,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitPriceDefault: catalog?.sellingPrice ?? 0,
            costPrice: catalog?.purchasePrice ?? 0,
            lineDiscount: item.lineDiscount ?? 0,
            lineTotal: item.quantity * item.unitPrice - (item.lineDiscount ?? 0),
            note: item.note,
            sortOrder: item.sortOrder ?? index,
          });
        });
        await manager.save(itemEntities);
      }

      return savedInvoice;
    });

    this.logger.log(
      `Created draft invoice ${invoice.id} (session=${dto.sessionId}, org=${actor.organizationId})`,
    );

    return this.findOneWithItems(invoice.id, actor);
  }

  async findAll(
    query: InvoiceQueryDto,
    actor: ActorContext,
  ): Promise<{ data: InvoiceEntity[]; total: number }> {
    const limit = Math.min(query.limit ?? 20, 100);
    const page = query.page ?? 1;
    const skip = (page - 1) * limit;

    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .where('invoice.organization_id = :organizationId', {
        organizationId: actor.organizationId,
      });

    if (query.status !== undefined) {
      qb.andWhere('invoice.status = :status', { status: query.status });
    }

    if (query.isDraft !== undefined) {
      qb.andWhere('invoice.is_draft = :isDraft', { isDraft: query.isDraft });
    }

    if (query.customerId) {
      qb.andWhere('invoice.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }

    if (query.branchId) {
      qb.andWhere('invoice.branch_id = :branchId', {
        branchId: query.branchId,
      });
    }

    if (query.sessionId) {
      qb.andWhere('invoice.session_id = :sessionId', {
        sessionId: query.sessionId,
      });
    }

    if (query.dateFrom) {
      qb.andWhere('invoice.issued_at >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }

    if (query.dateTo) {
      qb.andWhere('invoice.issued_at <= :dateTo', { dateTo: query.dateTo });
    }

    qb.orderBy('invoice.created_at', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total };
  }

  async findOne(id: string, actor: ActorContext): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    return invoice;
  }

  async findOneWithItems(
    id: string,
    actor: ActorContext,
  ): Promise<InvoiceEntity & { items: Array<InvoiceItemEntity & { location: LocationEntity | null }> }> {
    const invoice = await this.findOne(id, actor);

    const items = await this.itemRepo.find({
      where: { invoiceId: id },
      order: { sortOrder: 'ASC' },
    });

    const itemsWithLocation = await this.attachLocations(items, actor);

    return Object.assign(invoice, { items: itemsWithLocation });
  }

  async update(
    id: string,
    dto: UpdateInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.findOne(id, actor);

    if (!invoice.isDraft) {
      throw new BadRequestException(
        `Invoice ${id} is not a draft and cannot be updated`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.items !== undefined) {
        await manager.delete(InvoiceItemEntity, { invoiceId: id });

        if (dto.items.length > 0) {
          const itemIds = [...new Set(dto.items.map((i) => i.itemId))];
          const catalogItems = await manager.findBy(ItemEntity, { id: In(itemIds) });
          const priceMap = new Map(catalogItems.map((c) => [c.id, c]));
          const productLocationMap = await this.resolveProductLocations(manager, catalogItems);

          const itemEntities = dto.items.map((item, index) => {
            const catalog = priceMap.get(item.itemId);
            const productId = catalog?.productId;
            const resolvedLocationId =
              item.locationId ?? (productId ? productLocationMap.get(productId) : undefined);
            return manager.create(InvoiceItemEntity, {
              organizationId: actor.organizationId,
              branchId: actor.branchId,
              createdBy: actor.userId,
              invoiceId: id,
              itemId: item.itemId,
              locationId: resolvedLocationId,
              itemCode: item.itemCode,
              itemName: item.itemName,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitPriceDefault: catalog?.sellingPrice ?? 0,
              costPrice: catalog?.purchasePrice ?? 0,
              lineDiscount: item.lineDiscount ?? 0,
              lineTotal: item.quantity * item.unitPrice - (item.lineDiscount ?? 0),
              note: item.note,
              sortOrder: item.sortOrder ?? index,
            });
          });
          await manager.save(itemEntities);
        }

        const lineTotals = dto.items.map(
          (i) => i.quantity * i.unitPrice - (i.lineDiscount ?? 0),
        );
        const subtotal = lineTotals.reduce((sum, t) => sum + t, 0);
        invoice.subtotal = subtotal;
        invoice.amountDue = subtotal - (invoice.discountAmount ?? 0) - (invoice.depositAmount ?? 0);
      }

      if (dto.customerId !== undefined) invoice.customerId = dto.customerId;
      if (dto.draftLabel !== undefined) invoice.draftLabel = dto.draftLabel;
      if (dto.note !== undefined) invoice.note = dto.note;

      await manager.save(invoice);
    });

    this.logger.log(`Updated draft invoice ${id} (org=${actor.organizationId})`);

    return this.findOneWithItems(id, actor);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const invoice = await this.findOne(id, actor);

    if (!invoice.isDraft) {
      throw new BadRequestException(
        `Invoice ${id} is not a draft and cannot be deleted`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(InvoiceItemEntity, { invoiceId: id });
      await manager.delete(InvoiceEntity, { id });
    });

    this.logger.log(`Deleted draft invoice ${id} (org=${actor.organizationId})`);
  }

  private async resolveProductLocations(
    manager: EntityManager,
    catalogItems: ItemEntity[],
  ): Promise<Map<string, string>> {
    const productIds = [
      ...new Set(catalogItems.map((c) => c.productId).filter((p): p is string => !!p)),
    ];
    if (productIds.length === 0) return new Map();

    const rows = await manager.findBy(ProductStorageLocationEntity, {
      productId: In(productIds),
    });
    return new Map(rows.map((r) => [r.productId, r.locationId]));
  }

  async findDrafts(
    sessionId: string,
    actor: ActorContext,
  ): Promise<
    Array<
      InvoiceEntity & {
        items: Array<InvoiceItemEntity & { location: LocationEntity | null }>;
      }
    >
  > {
    const drafts = await this.invoiceRepo.find({
      where: {
        organizationId: actor.organizationId,
        sessionId,
        isDraft: true,
      },
      order: { createdAt: 'DESC' },
    });

    if (drafts.length === 0) return [];

    const items = await this.itemRepo.find({
      where: { invoiceId: In(drafts.map((d) => d.id)) },
      order: { sortOrder: 'ASC' },
    });

    const itemsWithLocation = await this.attachLocations(items, actor);

    const itemsByInvoice = new Map<
      string,
      Array<InvoiceItemEntity & { location: LocationEntity | null }>
    >();
    for (const item of itemsWithLocation) {
      const bucket = itemsByInvoice.get(item.invoiceId) ?? [];
      bucket.push(item);
      itemsByInvoice.set(item.invoiceId, bucket);
    }

    return drafts.map((draft) =>
      Object.assign(draft, { items: itemsByInvoice.get(draft.id) ?? [] }),
    );
  }

  private async attachLocations(
    items: InvoiceItemEntity[],
    actor: ActorContext,
  ): Promise<Array<InvoiceItemEntity & { location: LocationEntity | null }>> {
    const locationIds = [
      ...new Set(items.map((i) => i.locationId).filter((id): id is string => !!id)),
    ];

    const locationMap = new Map<string, LocationEntity>();
    if (locationIds.length > 0) {
      const locations = await this.locationRepo.findBy({
        id: In(locationIds),
        organizationId: actor.organizationId,
      });
      for (const loc of locations) locationMap.set(loc.id, loc);
    }

    return items.map((item) =>
      Object.assign(item, {
        location: item.locationId ? locationMap.get(item.locationId) ?? null : null,
      }),
    );
  }
}
