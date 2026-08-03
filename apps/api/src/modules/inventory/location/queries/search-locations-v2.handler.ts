import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { LocationEntity } from '../location.entity';
import {
  LocationSearchV2ResponseDto,
  LocationSearchV2RowDto,
} from '../dto/location-search-v2.dto';
import { SearchLocationsV2Query } from './search-locations-v2.query';

/**
 * "Đã xếp hàng hóa" — a location holds items when it has ≥1 stock_balance row.
 * Used both as a filter predicate and as the `hasItems` projection, so the list
 * needs a single round-trip (listLocations does it in a second query).
 * `:organizationId` is already bound by the base WHERE clause.
 */
const HAS_ITEMS_SQL = `EXISTS (
  SELECT 1 FROM stock_balances sb
  WHERE sb.location_id = location.id
    AND sb.organization_id = :organizationId
)`;

interface HasItemsRaw {
  has_items: boolean;
}

@QueryHandler(SearchLocationsV2Query)
export class SearchLocationsV2Handler
  implements IQueryHandler<SearchLocationsV2Query>
{
  constructor(
    @InjectRepository(LocationEntity)
    private readonly repo: Repository<LocationEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchLocationsV2Query): Promise<LocationSearchV2ResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('location')
      // Branch scope lives on the storage, not on location.branchId (which can
      // be stale) — same rule as InventoryLocationService.listLocations.
      .innerJoin('location.storage', 'storage')
      .where('location.organizationId = :organizationId', {
        organizationId: actor.organizationId,
      });

    if (actor.branchId) {
      qb.andWhere('storage.branchId = :branchId', { branchId: actor.branchId });
    }
    if (!dto.includeUnassigned) {
      qb.andWhere('location.isUnassigned = false');
    }

    new FilterBuilder(qb)
      .applyString('location.code', dto.code)
      .applyString('location.name', dto.name)
      // description is nullable — COALESCE so `notContains` also matches NULLs.
      .applyString("COALESCE(location.description, '')", dto.description)
      .applyEnum('location.storageId', dto.storageId?.value);

    if (dto.isActive !== undefined) {
      qb.andWhere('location.isActive = :isActive', { isActive: dto.isActive });
    }
    if (dto.hasItems !== undefined) {
      qb.andWhere(dto.hasItems ? HAS_ITEMS_SQL : `NOT ${HAS_ITEMS_SQL}`);
    }

    const countQb = qb.clone();

    qb.addSelect(HAS_ITEMS_SQL, 'has_items')
      .orderBy('location.code', 'ASC')
      .addOrderBy('location.name', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    const [result, total] = await Promise.all([
      qb.getRawAndEntities<HasItemsRaw>(),
      countQb.getCount(),
    ]);

    const data: LocationSearchV2RowDto[] = result.entities.map(
      (location, index) => ({
        id: location.id,
        code: location.code,
        name: location.name,
        storageId: location.storageId,
        branchId: location.branchId ?? null,
        type: location.type,
        description: location.description ?? null,
        isActive: location.isActive,
        isDefault: location.isDefault,
        hasItems: result.raw[index]?.has_items ?? false,
      }),
    );

    return { data, total, page, limit };
  }
}
