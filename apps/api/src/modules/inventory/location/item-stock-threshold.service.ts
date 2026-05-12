import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryLocationService } from './inventory-location.service';
import { ItemStockThresholdEntity } from './item-stock-threshold.entity';
import { LocationEntity } from './location.entity';
import { SetStockThresholdDto } from './dto/set-stock-threshold.dto';

export interface ThresholdView {
  id: string | null;
  itemId: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  minQty: number | null;
  maxQty: number | null;
}

@Injectable()
export class ItemStockThresholdService {
  constructor(
    @InjectRepository(ItemStockThresholdEntity)
    private readonly repo: Repository<ItemStockThresholdEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    private readonly locationService: InventoryLocationService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Return one row per active location in the org. Locations without a configured threshold
   * are returned with id=null, minQty=null, maxQty=null. UX-friendly for the storage tab.
   */
  async list(itemId: string, actor: ActorContext): Promise<ThresholdView[]> {
    await this.locationService.getItemById(itemId, actor);

    const locations = await this.locationRepo.find({
      where: { organizationId: actor.organizationId, isActive: true },
      order: { code: 'ASC' },
    });
    const rows = await this.repo.find({
      where: { itemId, organizationId: actor.organizationId },
    });
    const byLoc = new Map(rows.map((r) => [r.locationId, r]));

    return locations.map((loc) => {
      const row = byLoc.get(loc.id);
      return {
        id: row?.id ?? null,
        itemId,
        locationId: loc.id,
        locationCode: loc.code,
        locationName: loc.name,
        minQty: row?.minQty != null ? Number(row.minQty) : null,
        maxQty: row?.maxQty != null ? Number(row.maxQty) : null,
      };
    });
  }

  async getOne(
    itemId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<ItemStockThresholdEntity> {
    await this.locationService.getItemById(itemId, actor);
    const row = await this.repo.findOne({
      where: { itemId, locationId, organizationId: actor.organizationId },
    });
    if (!row) {
      throw new NotFoundException(
        `Chưa có định mức tồn cho mặt hàng ${itemId} tại vị trí ${locationId}`,
      );
    }
    return row;
  }

  async upsert(
    itemId: string,
    locationId: string,
    dto: SetStockThresholdDto,
    actor: ActorContext,
  ): Promise<ItemStockThresholdEntity> {
    const item = await this.locationService.getItemById(itemId, actor);
    const location = await this.locationRepo.findOne({
      where: { id: locationId, organizationId: actor.organizationId },
    });
    if (!location) {
      throw new BadRequestException(
        `Vị trí ${locationId} không tồn tại trong tổ chức`,
      );
    }
    validateMinMax(dto);

    const existing = await this.repo.findOne({
      where: { itemId, locationId, organizationId: actor.organizationId },
    });
    if (existing) {
      existing.minQty = dto.minQty ?? undefined;
      existing.maxQty = dto.maxQty ?? undefined;
      return this.repo.save(existing);
    }

    return this.repo.save(
      this.repo.create({
        itemId,
        locationId,
        minQty: dto.minQty ?? undefined,
        maxQty: dto.maxQty ?? undefined,
        organizationId: actor.organizationId,
        branchId: item.branchId ?? location.branchId,
        createdBy: actor.userId,
      }),
    );
  }

  async delete(
    itemId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.locationService.getItemById(itemId, actor);
    const row = await this.repo.findOne({
      where: { itemId, locationId, organizationId: actor.organizationId },
    });
    if (!row) {
      throw new NotFoundException(
        `Không có định mức để xóa cho cặp (item ${itemId}, location ${locationId})`,
      );
    }
    await this.repo.remove(row);
  }

  /**
   * Apply a default threshold to every active location in the org for the given item.
   * TODO Phase 2: also fan out to locations created later via a hook in createLocation().
   */
  async setDefault(
    itemId: string,
    dto: SetStockThresholdDto,
    actor: ActorContext,
  ): Promise<{ applied: number }> {
    const item = await this.locationService.getItemById(itemId, actor);
    validateMinMax(dto);

    return this.dataSource.transaction(async (manager) => {
      const locations = await manager.find(LocationEntity, {
        where: { organizationId: actor.organizationId, isActive: true },
      });
      for (const loc of locations) {
        const existing = await manager.findOne(ItemStockThresholdEntity, {
          where: { itemId, locationId: loc.id },
        });
        if (existing) {
          existing.minQty = dto.minQty ?? undefined;
          existing.maxQty = dto.maxQty ?? undefined;
          await manager.save(ItemStockThresholdEntity, existing);
        } else {
          await manager.save(
            ItemStockThresholdEntity,
            manager.create(ItemStockThresholdEntity, {
              itemId,
              locationId: loc.id,
              minQty: dto.minQty ?? undefined,
              maxQty: dto.maxQty ?? undefined,
              organizationId: actor.organizationId,
              branchId: item.branchId ?? loc.branchId,
              createdBy: actor.userId,
            }),
          );
        }
      }
      return { applied: locations.length };
    });
  }
}

function validateMinMax(dto: SetStockThresholdDto): void {
  if (
    dto.minQty != null &&
    dto.maxQty != null &&
    Number(dto.minQty) > Number(dto.maxQty)
  ) {
    throw new BadRequestException('Định mức tối thiểu phải nhỏ hơn hoặc bằng tối đa');
  }
}
