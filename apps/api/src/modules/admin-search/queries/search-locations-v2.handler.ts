import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { LocationEntity } from '../../inventory/location/location.entity';
import { SearchLocationsV2Query } from './search-locations-v2.query';

@QueryHandler(SearchLocationsV2Query)
export class SearchLocationsV2Handler
  implements IQueryHandler<SearchLocationsV2Query>
{
  constructor(
    @InjectRepository(LocationEntity)
    private readonly repo: Repository<LocationEntity>,
  ) {}

  async execute({ dto, actor }: SearchLocationsV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.storage', 'storage')
      .where('location.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    // Branch-scoped in practice: confine to the active branch when present.
    if (actor.branchId) {
      qb.andWhere('location.branchId = :actorBranchId', {
        actorBranchId: actor.branchId,
      });
    }

    new FilterBuilder(qb)
      .applyString('location.code', dto.code)
      .applyString('location.name', dto.name)
      .applyEnum('location.type', dto.type?.value);

    if (dto.storageId) {
      qb.andWhere('location.storageId = :storageId', {
        storageId: dto.storageId,
      });
    }
    if (dto.isActive !== undefined) {
      qb.andWhere('location.isActive = :isActive', { isActive: dto.isActive });
    }

    qb.orderBy('location.code', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    // Flatten the joined storage into a scalar `storageName` so the row shape
    // matches the FE "Thuộc kho" column without a nested object.
    const data = rows.map((row) => {
      const { storage, ...rest } = row;
      return { ...rest, storageName: storage?.name ?? '' };
    });

    return { data, total, page, limit };
  }
}
