import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { BranchEntity } from '../../branch/branch.entity';
import { CustomerEntity } from '../../customer/customer.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { SearchDraftInvoicesV2Query } from './search-draft-invoices-v2.query';

@QueryHandler(SearchDraftInvoicesV2Query)
export class SearchDraftInvoicesV2Handler
  implements IQueryHandler<SearchDraftInvoicesV2Query>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
  ) {}

  async execute({ dto, actor }: SearchDraftInvoicesV2Query) {
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
      .andWhere('inv.isDraft = true');

    if (actor.branchId) {
      qb.andWhere('inv.branchId = :branchId', { branchId: actor.branchId });
    }

    if (dto.sessionId) {
      qb.andWhere('inv.sessionId = :sid', { sid: dto.sessionId });
    }

    const q = dto.search?.trim();
    if (q) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('inv.code ILIKE :q', { q: `%${q}%` })
            .orWhere('customer.name ILIKE :q')
            .orWhere('customer.phone ILIKE :q');
        }),
      );
    }

    new FilterBuilder(qb).applyDateRange('inv.createdAt', dto.createdAt);

    qb.orderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Attach line items per draft (the detail panel renders them) — mirrors the
    // legacy `GET /invoices/drafts` (findDrafts) behaviour.
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
      for (const draft of data) {
        (draft as InvoiceEntity & { items: InvoiceItemEntity[] }).items =
          byInvoice.get(draft.id) ?? [];
      }
    }

    return { data, total, page, limit };
  }
}
