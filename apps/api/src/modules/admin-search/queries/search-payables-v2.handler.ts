import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { PayableEntity } from '../../accounting/payables/payable.entity';
import { SearchPayablesV2Query } from './search-payables-v2.query';

@QueryHandler(SearchPayablesV2Query)
export class SearchPayablesV2Handler
  implements IQueryHandler<SearchPayablesV2Query>
{
  constructor(
    @InjectRepository(PayableEntity)
    private readonly repo: Repository<PayableEntity>,
  ) {}

  async execute({ dto, actor }: SearchPayablesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('payable')
      .where('payable.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('payable.documentNumber', dto.documentNumber)
      .applyString('payable.vendorName', dto.vendorName)
      .applyString('payable.currency', dto.currency)
      .applyCompare('payable.amount', dto.amount)
      .applyCompare('payable.settledAmount', dto.settledAmount)
      .applyDateRange('payable.dueDate', dto.dueDate)
      .applyEnum('payable.status', dto.status?.value);

    qb.orderBy('payable.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
