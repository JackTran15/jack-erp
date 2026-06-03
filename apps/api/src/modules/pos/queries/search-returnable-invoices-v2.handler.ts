import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { BranchEntity } from '../../branch/branch.entity';
import { CustomerEntity } from '../../customer/customer.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import { SearchReturnableInvoicesV2Query } from './search-returnable-invoices-v2.query';

@QueryHandler(SearchReturnableInvoicesV2Query)
export class SearchReturnableInvoicesV2Handler
  implements IQueryHandler<SearchReturnableInvoicesV2Query>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
  ) {}

  async execute({ dto, actor }: SearchReturnableInvoicesV2Query) {
    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('inv')
      .leftJoinAndMapOne(
        'inv.customer',
        CustomerEntity,
        'customer',
        'customer.id = inv.customerId AND customer.organizationId = inv.organizationId',
      )
      .leftJoinAndMapOne(
        'inv.branch',
        BranchEntity,
        'branch',
        'branch.id = inv.branch_id::uuid',
      )
      .where('inv.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('inv.type = :type', { type: InvoiceType.SALE })
      .andWhere('inv.status = :status', { status: InvoiceStatus.PAID })
      .andWhere('inv.isDraft = false');

    if (actor.branchId) {
      qb.andWhere('inv.branchId = :branchId', { branchId: actor.branchId });
    }

    new FilterBuilder(qb)
      .applyString('inv.code',       dto.code)
      .applyDateRange('inv.createdAt', dto.createdAt)
      .applyString('customer.name',  dto.customerName)
      .applyString('customer.phone', dto.customerPhone)
      .applyCompare('inv.totalPaid', dto.totalPaid)
      .applyString('branch.name',    dto.branchName);

    qb.orderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
