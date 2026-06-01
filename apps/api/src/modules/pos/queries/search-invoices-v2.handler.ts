import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { CustomerEntity } from '../../customer/customer.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { SearchInvoicesV2Query } from './search-invoices-v2.query';

@QueryHandler(SearchInvoicesV2Query)
export class SearchInvoicesV2Handler
  implements IQueryHandler<SearchInvoicesV2Query>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
  ) {}

  async execute({ dto, actor }: SearchInvoicesV2Query) {
    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('inv')
      .leftJoin(
        CustomerEntity,
        'customer',
        'customer.id = inv.customerId AND customer.organizationId = inv.organizationId',
      )
      .where('inv.organizationId = :orgId', { orgId: actor.organizationId });

    if (actor.branchId) {
      qb.andWhere('inv.branchId = :branchId', { branchId: actor.branchId });
    }

    new FilterBuilder(qb)
      .applyString('inv.code',        dto.code)
      .applyEnum('inv.status',        dto.status?.value)
      .applyEnum('inv.type',          dto.type?.value)
      .applyDateRange('inv.issuedAt', dto.issuedAt)
      .applyDateRange('inv.createdAt', dto.createdAt)
      .applyString('customer.phone',  dto.customerPhone)
      .applyString('customer.code',   dto.customerCode)
      .applyString('customer.name',   dto.customerName)
      .applyCompare('inv.amountDue',  dto.amountDue)
      .applyString('inv.note',        dto.note);

    if (dto.customerId) {
      qb.andWhere('inv.customerId = :cid', { cid: dto.customerId });
    }

    qb.orderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
