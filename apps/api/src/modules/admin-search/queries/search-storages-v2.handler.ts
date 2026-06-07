import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { SearchStoragesV2Query } from './search-storages-v2.query';

@QueryHandler(SearchStoragesV2Query)
export class SearchStoragesV2Handler
  implements IQueryHandler<SearchStoragesV2Query>
{
  constructor(
    @InjectRepository(StorageEntity)
    private readonly repo: Repository<StorageEntity>,
  ) {}

  async execute({ dto, actor }: SearchStoragesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('storage')
      .where('storage.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    // Branch-scoped entity: mirror BaseCrudService — when the request carries an
    // active branch, confine the list to it (the explicit branchId filter narrows further).
    if (actor.branchId) {
      qb.andWhere('storage.branchId = :actorBranchId', {
        actorBranchId: actor.branchId,
      });
    }

    new FilterBuilder(qb).applyString('storage.name', dto.name);

    if (dto.branchId) {
      qb.andWhere('storage.branchId = :branchId', { branchId: dto.branchId });
    }
    if (dto.isMainStorage !== undefined) {
      qb.andWhere('storage.isMainStorage = :isMainStorage', {
        isMainStorage: dto.isMainStorage,
      });
    }

    // sortBy is whitelisted in the DTO, so the column is safe to interpolate.
    const sortColumn = dto.sortBy ?? 'name';
    const sortDir = dto.sortOrder === 'desc' ? 'DESC' : 'ASC';
    qb.orderBy(`storage.${sortColumn}`, sortDir)
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }
}
