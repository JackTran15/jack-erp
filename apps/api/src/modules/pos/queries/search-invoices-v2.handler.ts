import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { CustomerEntity } from '../../customer/customer.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { SearchInvoicesV2Query } from './search-invoices-v2.query';

@QueryHandler(SearchInvoicesV2Query)
export class SearchInvoicesV2Handler
  implements IQueryHandler<SearchInvoicesV2Query>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
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

    // Attach line items per invoice so callers see per-line discount breakdown
    // and notes — mirrors SearchDraftInvoicesV2Handler.
    if (data.length > 0) {
      const items = await this.itemRepo.find({
        where: { invoiceId: In(data.map((d) => d.id)) },
        order: { sortOrder: 'ASC' },
      });
      const byInvoice = new Map<string, InvoiceItemEntity[]>();
      for (const item of items) {
        const bucket = byInvoice.get(item.invoiceId) ?? [];
        bucket.push(item);
        byInvoice.set(item.invoiceId, bucket);
      }
      for (const inv of data) {
        (inv as InvoiceEntity & { items: InvoiceItemEntity[] }).items =
          byInvoice.get(inv.id) ?? [];
      }
    }

    return { data, total, page, limit };
  }
}
