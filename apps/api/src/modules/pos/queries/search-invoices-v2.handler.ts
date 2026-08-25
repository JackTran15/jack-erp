import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { CustomerEntity } from '../../customer/customer.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { invoiceSignedTotalSql } from '../services/invoice-amount.util';
import { InvoiceSearchV2Dto } from '../dto/invoice-search-v2.dto';
import { SearchInvoicesV2Query } from './search-invoices-v2.query';

interface TotalsRaw {
  total: string;
  totalAmount: string;
}

/** The only customer fields the invoice grid renders. See `attachCustomers`. */
interface InvoiceListCustomer {
  id: string;
  code: string;
  name: string;
  phone?: string;
}

@QueryHandler(SearchInvoicesV2Query)
export class SearchInvoicesV2Handler
  implements IQueryHandler<SearchInvoicesV2Query>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
  ) {}

  async execute({ dto, actor }: SearchInvoicesV2Query) {
    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 20;

    const rowsQb = this.buildQuery(dto, actor)
      .orderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const totalsQb = this.buildQuery(dto, actor)
      .select('COUNT(*)', 'total')
      .addSelect(
        `COALESCE(SUM(${invoiceSignedTotalSql('inv')}), 0)`,
        'totalAmount',
      );

    const [data, totals] = await Promise.all([
      rowsQb.getMany(),
      totalsQb.getRawOne<TotalsRaw>(),
    ]);

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

    await this.attachCustomers(data, actor.organizationId);

    return {
      data,
      total: Number(totals?.total ?? 0),
      page,
      limit,
      totals: { totalAmount: Number(totals?.totalAmount ?? 0) },
    };
  }

  /**
   * Resolve each invoice's customer in one page-scoped query and hang it off the
   * row, so the grid never has to fetch customers one id at a time.
   *
   * The columns are projected explicitly rather than joined with
   * `leftJoinAndMapOne` — that helper selects every column of the alias, and
   * CustomerEntity carries national id, date of birth, address, tax code and
   * internal notes. None of those belong in an invoice grid, and this endpoint
   * is reachable by any authenticated user of the organization.
   *
   * The organization scope is repeated here: the customer join in buildQuery
   * guards the filters, not this read.
   */
  private async attachCustomers(
    data: InvoiceEntity[],
    organizationId: string,
  ): Promise<void> {
    if (data.length === 0) return;

    const customerIds = [
      ...new Set(
        data
          .map((inv) => inv.customerId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const withCustomer = data as (InvoiceEntity & {
      customer: InvoiceListCustomer | null;
    })[];

    if (customerIds.length === 0) {
      for (const inv of withCustomer) inv.customer = null;
      return;
    }

    const customers = await this.customerRepo.find({
      where: { id: In(customerIds), organizationId },
      select: ['id', 'code', 'name', 'phone'],
    });
    const byId = new Map(customers.map((c) => [c.id, c]));

    for (const inv of withCustomer) {
      inv.customer = inv.customerId
        ? (byId.get(inv.customerId) as InvoiceListCustomer | undefined) ?? null
        : null;
    }
  }

  /**
   * Scope + every column filter. Built twice per request (rows, totals) so the
   * footer total can never disagree with the grid.
   *
   * The customer join lives here rather than on the rows query: three filters
   * reference its alias, so the totals query needs it too. It is many-to-one,
   * so it cannot multiply rows — and the totals query selects only aggregates,
   * so none of its columns come back.
   */
  private buildQuery(
    dto: InvoiceSearchV2Dto,
    actor: ActorContext,
  ): SelectQueryBuilder<InvoiceEntity> {
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

    return qb;
  }
}
