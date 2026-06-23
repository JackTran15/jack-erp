import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../../../common/filters/filter.builder';
import { CashCountEntity } from '../cash-count.entity';
import { SearchCashCountsV2Query } from './search-cash-counts-v2.query';

@QueryHandler(SearchCashCountsV2Query)
export class SearchCashCountsV2Handler
  implements IQueryHandler<SearchCashCountsV2Query>
{
  constructor(
    @InjectRepository(CashCountEntity)
    private readonly repo: Repository<CashCountEntity>,
  ) {}

  async execute({ dto, actor }: SearchCashCountsV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Mirrors CashCountsService.list(): cash counts are organization-scoped,
    // while branch context is required by the controller but is not a row filter.
    const qb = this.repo
      .createQueryBuilder('cashCount')
      .where('cashCount.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyDateRange('cashCount.countedAt', dto.countedAt)
      .applyString('cashCount.documentNumber', dto.documentNumber)
      .applyString('cashCount.purpose', dto.purpose)
      .applyEnum('cashCount.status', dto.status?.value);

    if (dto.cashAccountId) {
      qb.andWhere('cashCount.cashAccountId = :cashAccountId', {
        cashAccountId: dto.cashAccountId,
      });
    }

    qb.orderBy('cashCount.countedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
