import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { ReceivableEntity } from '../../accounting/receivables/receivable.entity';
import { SearchReceivablesV2Query } from './search-receivables-v2.query';

@QueryHandler(SearchReceivablesV2Query)
export class SearchReceivablesV2Handler
  implements IQueryHandler<SearchReceivablesV2Query>
{
  constructor(
    @InjectRepository(ReceivableEntity)
    private readonly repo: Repository<ReceivableEntity>,
  ) {}

  async execute({ dto, actor }: SearchReceivablesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('receivable')
      .where('receivable.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('receivable.documentNumber', dto.documentNumber)
      .applyString('receivable.currency', dto.currency)
      .applyCompare('receivable.amount', dto.amount)
      .applyCompare('receivable.settledAmount', dto.settledAmount)
      .applyDateRange('receivable.dueDate', dto.dueDate)
      .applyEnum('receivable.status', dto.status?.value);

    qb.orderBy('receivable.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
