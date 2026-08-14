import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { BranchEntity } from '../../branch/branch.entity';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { invoiceSignedTotalSql } from '../services/invoice-amount.util';
import { PurchaseHistorySearchV2Dto } from '../dto/purchase-history-search-v2.dto';
import { SearchPurchaseHistoryV2Query } from './search-purchase-history-v2.query';

interface TotalsRaw {
  total: string;
  totalAmount: string;
}

/**
 * Statuses that count as a real transaction in a customer's history. Anything
 * else (draft, pending) never happened from the customer's point of view. The
 * frontend used to drop these rows *after* fetching, which made the "Tổng hóa
 * đơn: N" count and the money footer describe two different sets.
 */
const HISTORY_STATUSES = [
  InvoiceStatus.PAID,
  InvoiceStatus.DEBT,
  InvoiceStatus.PARTIAL_DEBT,
  InvoiceStatus.CANCELLED,
];

@QueryHandler(SearchPurchaseHistoryV2Query)
export class SearchPurchaseHistoryV2Handler
  implements IQueryHandler<SearchPurchaseHistoryV2Query>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
  ) {}

  async execute({ dto, actor }: SearchPurchaseHistoryV2Query) {
    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 20;

    const rowsQb = this.buildQuery(dto, actor)
      .orderBy('inv.issuedAt', 'DESC')
      .addOrderBy('inv.createdAt', 'DESC')
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

    return {
      data,
      total: Number(totals?.total ?? 0),
      page,
      limit,
      totals: { totalAmount: Number(totals?.totalAmount ?? 0) },
    };
  }

  /**
   * Scope + every column filter. Built twice per request (rows, totals) so the
   * footer total can never disagree with the grid.
   *
   * Org-wide for the given customer on purpose: a purchase history spans every
   * store, so this one is not branch-scoped.
   *
   * "Tổng thanh toán" filters the same signed expression the column displays
   * (`invoiceSignedTotalSql`). It used to filter `inv.totalPaid` — money
   * actually collected — so a debt invoice showing 1.000.000 had `total_paid=0`
   * and slipped through every `≤ X`.
   */
  private buildQuery(
    dto: PurchaseHistorySearchV2Dto,
    actor: ActorContext,
  ): SelectQueryBuilder<InvoiceEntity> {
    const qb = this.repo
      .createQueryBuilder('inv')
      .leftJoinAndMapOne(
        'inv.branch',
        BranchEntity,
        'branch',
        'branch.id = inv.branch_id::uuid',
      )
      .where('inv.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('inv.customerId = :cid', { cid: dto.customerId })
      .andWhere('inv.isDraft = false')
      .andWhere('inv.status IN (:...historyStatuses)', {
        historyStatuses: HISTORY_STATUSES,
      });

    new FilterBuilder(qb)
      .applyString('inv.code',        dto.code)
      .applyDateRange('inv.issuedAt', dto.issuedAt)
      .applyString('branch.name',     dto.storeName)
      .applyEnum('inv.status',        dto.status?.value)
      .applyCompare(invoiceSignedTotalSql('inv'), dto.totalAmount)
      .applyString('inv.note',        dto.note);

    return qb;
  }
}
