import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { SearchItemCategoriesV2Query } from './search-item-categories-v2.query';

@QueryHandler(SearchItemCategoriesV2Query)
export class SearchItemCategoriesV2Handler
  implements IQueryHandler<SearchItemCategoriesV2Query>
{
  constructor(
    @InjectRepository(ItemCategoryEntity)
    private readonly repo: Repository<ItemCategoryEntity>,
  ) {}

  async execute({ dto, actor }: SearchItemCategoriesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('category')
      .where('category.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('category.code', dto.code)
      .applyString('category.name', dto.name)
      .applyDateRange('category.createdAt', dto.createdAt);

    qb.orderBy('category.code', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }
}
