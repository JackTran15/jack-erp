import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  ResolveItemLocationsResponseDto,
  ResolvedItemLocationDto,
  ResolvedLocationSource,
} from '../dto/resolve-item-locations.dto';
import { ItemEntity } from '../item.entity';
import { LocationEntity } from '../location.entity';
import { StorageEntity } from '../storage.entity';
import { StockBalanceEntity } from '../../ledger/stock-balance.entity';
import { ItemStorageLocationEntity } from '../../product/item-storage-location.entity';
import { ResolveItemLocationsQuery } from './resolve-item-locations.query';

@QueryHandler(ResolveItemLocationsQuery)
export class ResolveItemLocationsHandler
  implements IQueryHandler<ResolveItemLocationsQuery>
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute({
    dto,
    actor,
  }: ResolveItemLocationsQuery): Promise<ResolveItemLocationsResponseDto> {
    const { variantItemIds, branchId, storageId: requestedStorageId } = dto;
    const manager = this.dataSource.manager;
    const orgId = actor.organizationId;

    // 1. Resolve the target storage. A client-supplied storageId always wins and
    //    skips the branch default lookup, per the API contract.
    let storageId: string | null = null;
    if (requestedStorageId) {
      const s = await manager.findOne(StorageEntity, {
        where: { id: requestedStorageId, organizationId: orgId },
      });
      storageId = s?.id ?? null;
    } else {
      const def = await manager.findOne(StorageEntity, {
        where: { organizationId: orgId, branchId, isDefaultReceiving: true },
      });
      storageId = def?.id ?? null;
    }

    // 2. Map each variant to its product.
    const items = variantItemIds.length
      ? await manager.find(ItemEntity, {
          where: { id: In(variantItemIds), organizationId: orgId },
          select: { id: true, productId: true },
        })
      : [];
    const productByItem = new Map<string, string | null>();
    for (const it of items) productByItem.set(it.id, it.productId ?? null);

    const emptyRow = (itemId: string): ResolvedItemLocationDto => ({
      itemId,
      productId: productByItem.get(itemId) ?? null,
      storageId,
      locationId: null,
      locationCode: null,
      locationName: null,
      source: 'none',
    });

    if (!storageId) {
      return { data: variantItemIds.map(emptyRow) };
    }

    // 3. Group variants by product so every sibling resolves to one location.
    const groupKeyForItem = (itemId: string): string => {
      const pid = productByItem.get(itemId) ?? null;
      return pid ? `p:${pid}` : `i:${itemId}`;
    };
    const groups = new Map<string, string[]>();
    for (const itemId of variantItemIds) {
      const key = groupKeyForItem(itemId);
      const arr = groups.get(key) ?? [];
      arr.push(itemId);
      groups.set(key, arr);
    }

    // Storage-level fallback location ("Mặc định" first, then "Chưa xếp").
    const defaultLoc = await manager.findOne(LocationEntity, {
      where: { storageId, organizationId: orgId, isDefault: true, isActive: true },
    });
    const fallbackLoc =
      defaultLoc ??
      (await manager.findOne(LocationEntity, {
        where: { storageId, organizationId: orgId, isUnassigned: true },
      })) ??
      null;

    const groupLocation = new Map<
      string,
      { locationId: string | null; source: ResolvedLocationSource }
    >();
    for (const [key, itemIds] of groups) {
      // a. Preferred shelf for any sibling in this storage (bỏ qua vị trí đã ngừng
      //    hoạt động — rơi xuống nhánh sau).
      const isl = await manager
        .createQueryBuilder(ItemStorageLocationEntity, 'isl')
        .innerJoin(
          'locations',
          'loc',
          'loc.id = isl.location_id AND loc.is_active = true',
        )
        .where('isl.item_id IN (:...itemIds)', { itemIds })
        .andWhere('isl.storage_id = :storageId', { storageId })
        .andWhere('isl.organization_id = :orgId', { orgId })
        .getOne();
      if (isl) {
        groupLocation.set(key, { locationId: isl.locationId, source: 'preferred' });
        continue;
      }
      // b. Bin currently holding the most stock of any sibling in this storage.
      const sb = await manager
        .createQueryBuilder(StockBalanceEntity, 'sb')
        .innerJoin('locations', 'loc', 'loc.id = sb.location_id')
        .where('sb.item_id IN (:...itemIds)', { itemIds })
        .andWhere('loc.storage_id = :storageId', { storageId })
        .andWhere('loc.is_active = true')
        .andWhere('sb.organization_id = :orgId', { orgId })
        .andWhere('sb.quantity > 0')
        .orderBy('sb.quantity', 'DESC')
        .getOne();
      if (sb) {
        groupLocation.set(key, { locationId: sb.locationId, source: 'stock' });
        continue;
      }
      // c. Storage default / unassigned fallback.
      if (fallbackLoc) {
        groupLocation.set(key, { locationId: fallbackLoc.id, source: 'default' });
        continue;
      }
      groupLocation.set(key, { locationId: null, source: 'none' });
    }

    // Hydrate code/name for the resolved locations in one query.
    const locIds = [
      ...new Set(
        [...groupLocation.values()]
          .map((v) => v.locationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const locs = locIds.length
      ? await manager.find(LocationEntity, { where: { id: In(locIds) } })
      : [];
    const locById = new Map(locs.map((l) => [l.id, l]));

    const data = variantItemIds.map((itemId) => {
      const resolved = groupLocation.get(groupKeyForItem(itemId)) ?? {
        locationId: null,
        source: 'none' as ResolvedLocationSource,
      };
      const loc = resolved.locationId ? locById.get(resolved.locationId) : null;
      return {
        itemId,
        productId: productByItem.get(itemId) ?? null,
        storageId,
        locationId: resolved.locationId,
        locationCode: loc?.code ?? null,
        locationName: loc?.name ?? null,
        source: resolved.source,
      };
    });

    return { data };
  }
}
