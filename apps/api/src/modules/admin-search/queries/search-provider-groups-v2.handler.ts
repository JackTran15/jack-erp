import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { SupplierGroupEntity } from '../../inventory/location/supplier-group.entity';
import { SearchProviderGroupsV2Query } from './search-provider-groups-v2.query';

@QueryHandler(SearchProviderGroupsV2Query)
export class SearchProviderGroupsV2Handler
  implements IQueryHandler<SearchProviderGroupsV2Query>
{
  constructor(
    @InjectRepository(SupplierGroupEntity)
    private readonly repo: Repository<SupplierGroupEntity>,
  ) {}

  async execute({ dto, actor }: SearchProviderGroupsV2Query) {
    const matchingQb = this.repo
      .createQueryBuilder('providerGroup')
      .where('providerGroup.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(matchingQb)
      .applyString('providerGroup.code', dto.code)
      .applyString('providerGroup.name', dto.name)
      .applyString('providerGroup.description', dto.description);

    if (dto.isActive !== undefined) {
      matchingQb.andWhere('providerGroup.isActive = :isActive', {
        isActive: dto.isActive,
      });
    }

    const [matches, total] = await matchingQb.getManyAndCount();
    const allRows = await this.repo
      .createQueryBuilder('providerGroup')
      .where('providerGroup.organizationId = :orgId', {
        orgId: actor.organizationId,
      })
      .orderBy('providerGroup.createdAt', 'DESC')
      .getMany();

    const byId = new Map(allRows.map((row) => [row.id, row]));
    const selectedIds = new Set<string>();
    for (const match of matches) {
      let current: SupplierGroupEntity | undefined = byId.get(match.id);
      while (current && !selectedIds.has(current.id)) {
        selectedIds.add(current.id);
        current = current.parentGroupId
          ? byId.get(current.parentGroupId)
          : undefined;
      }
    }

    const data = allRows.filter((row) => selectedIds.has(row.id));
    return { data, total, page: 1, limit: data.length };
  }
}
