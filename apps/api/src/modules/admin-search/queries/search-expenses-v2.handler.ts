import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { ExpenseEntity } from '../../accounting/expenses/expense.entity';
import { SearchExpensesV2Query } from './search-expenses-v2.query';

@QueryHandler(SearchExpensesV2Query)
export class SearchExpensesV2Handler
  implements IQueryHandler<SearchExpensesV2Query>
{
  constructor(
    @InjectRepository(ExpenseEntity)
    private readonly repo: Repository<ExpenseEntity>,
  ) {}

  async execute({ dto, actor }: SearchExpensesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('expense')
      .where('expense.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('expense.description', dto.description)
      .applyCompare('expense.amount', dto.amount)
      .applyEnum('expense.status', dto.status?.value);

    qb.orderBy('expense.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
