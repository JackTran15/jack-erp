import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { BranchEntity } from '../../branch/branch.entity';
import { CustomerEntity } from '../../customer/customer.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import { SearchReturnableInvoicesV2Query } from './search-returnable-invoices-v2.query';

@QueryHandler(SearchReturnableInvoicesV2Query)
export class SearchReturnableInvoicesV2Handler
  implements IQueryHandler<SearchReturnableInvoicesV2Query>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
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
      .andWhere('inv.isDraft = false')
      // Hide fully-returned invoices: keep only those with at least one sold
      // (OUT) line that still has un-returned quantity. Partially-returned
      // invoices stay listed because they still have items left to return.
      .andWhere(
        `EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = inv.id
            AND ii.direction = :outDir
            AND ii.quantity > ii.returned_quantity
        )`,
        { outDir: ItemDirection.OUT },
      );

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
