import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { CustomerEntity } from '../../customer/customer.entity';
import { SearchCustomersV2Query } from './search-customers-v2.query';

@QueryHandler(SearchCustomersV2Query)
export class SearchCustomersV2Handler
  implements IQueryHandler<SearchCustomersV2Query>
{
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly repo: Repository<CustomerEntity>,
  ) {}

  async execute({ dto, actor }: SearchCustomersV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('customer')
      .where('customer.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('customer.code', dto.code)
      .applyString('customer.name', dto.name)
      .applyString('customer.email', dto.email)
      .applyString('customer.phone', dto.phone)
      .applyEnum('customer.status', dto.status?.value)
      .applyDateRange('customer.createdAt', dto.createdAt);

    if (dto.branchId) {
      qb.andWhere('customer.branchId = :branchId', { branchId: dto.branchId });
    }

    qb.orderBy('customer.code', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
