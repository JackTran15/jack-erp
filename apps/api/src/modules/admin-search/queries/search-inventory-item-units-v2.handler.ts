import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { UnitOfMeasureEntity } from '../../inventory/location/unit-of-measure.entity';
import { SearchInventoryItemUnitsV2Query } from './search-inventory-item-units-v2.query';

@QueryHandler(SearchInventoryItemUnitsV2Query)
export class SearchInventoryItemUnitsV2Handler
  implements IQueryHandler<SearchInventoryItemUnitsV2Query>
{
  constructor(
    @InjectRepository(UnitOfMeasureEntity)
    private readonly repo: Repository<UnitOfMeasureEntity>,
  ) {}

  async execute({ dto, actor }: SearchInventoryItemUnitsV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const qb = this.repo
      .createQueryBuilder('unit')
      .where('unit.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('unit.name', dto.name)
      .applyString('unit.description', dto.description);

    if (dto.isActive !== undefined) {
      qb.andWhere('unit.isActive = :isActive', { isActive: dto.isActive });
    }

    qb.orderBy('unit.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
