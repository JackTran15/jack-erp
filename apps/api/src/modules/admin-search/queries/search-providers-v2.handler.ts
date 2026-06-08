import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { ProviderEntity } from '../../inventory/location/provider.entity';
import { SearchProvidersV2Query } from './search-providers-v2.query';

@QueryHandler(SearchProvidersV2Query)
export class SearchProvidersV2Handler
  implements IQueryHandler<SearchProvidersV2Query>
{
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly repo: Repository<ProviderEntity>,
  ) {}

  async execute({ dto, actor }: SearchProvidersV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('provider')
      .leftJoinAndSelect('provider.group', 'group')
      .where('provider.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('provider.code', dto.code)
      .applyString('provider.name', dto.name)
      .applyString('provider.email', dto.email)
      .applyString('provider.phone', dto.phone)
      .applyString('provider.taxCode', dto.taxCode)
      .applyEnum('provider.type', dto.type?.value)
      .applyDateRange('provider.createdAt', dto.createdAt);

    if (dto.isActive !== undefined) {
      qb.andWhere('provider.isActive = :isActive', { isActive: dto.isActive });
    }
    if (dto.isCustomer !== undefined) {
      qb.andWhere('provider.isCustomer = :isCustomer', {
        isCustomer: dto.isCustomer,
      });
    }
    if (dto.groupId) {
      qb.andWhere('provider.groupId = :groupId', { groupId: dto.groupId });
    }

    qb.orderBy('provider.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    // Flatten the joined supplier group into a scalar `groupName`, mirroring
    // InventoryProviderCrudService.transformListResults() so the row shape is
    // identical to the current generic CRUD list (no nested `group` object).
    const data = rows.map((row) => {
      const { group, ...rest } = row;
      return { ...rest, groupName: group?.name ?? '' };
    });

    return { data, total, page, limit };
  }
}
