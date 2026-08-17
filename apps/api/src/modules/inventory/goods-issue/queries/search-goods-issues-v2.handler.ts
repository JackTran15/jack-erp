import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GoodsIssueStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { GoodsIssueEntity } from '../goods-issue.entity';
import { GoodsIssueSearchV2Dto } from '../dto/goods-issue-search-v2.dto';
import {
  attachCounterparties,
  counterpartyNameSql,
} from '../../location/services/counterparty-name.util';
import { SearchGoodsIssuesV2Query } from './search-goods-issues-v2.query';

/**
 * Correlated line total — mirrors the client-side Tổng tiền calc
 * (SUM(quantity * unit_price)). Drives both the server-side `totalAmount`
 * filter and the footer grand total, so the two can never disagree on what
 * "Tổng tiền" means.
 *
 * A correlated subquery rather than a join on purpose: the rows query joins
 * `lines` one-to-many, and summing over that join would count a 5-line issue
 * five times. The totals query never joins `lines` at all.
 */
const TOTAL_AMOUNT_SUBQUERY = `(SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
   FROM goods_issue_lines l WHERE l.goods_issue_id = gi.id)`;

interface TotalsRaw {
  total: string;
  totalAmount: string;
}

/** Đối tượng (party) — counterparty (supplier/customer/employee), else the
 *  transfer target branch (for purpose=TRANSFER_OUT). */
const PARTY_EXPRESSION = `COALESCE(${counterpartyNameSql('gi')}, targetBranch.name)`;

@QueryHandler(SearchGoodsIssuesV2Query)
export class SearchGoodsIssuesV2Handler
  implements IQueryHandler<SearchGoodsIssuesV2Query>
{
  constructor(
    @InjectRepository(GoodsIssueEntity)
    private readonly repo: Repository<GoodsIssueEntity>,
  ) {}

  async execute({ dto, actor }: SearchGoodsIssuesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Eager relations are joined explicitly so the row shape matches the
    // current find()-based list (provider, targetBranch, reasonRef, location).
    // Line detail is fetched lazily via GET /inventory/goods-issues/:id/lines
    // once a document is opened, not as part of the list response.
    const rowsQb = this.buildQuery(dto, actor)
      // buildQuery only joins targetBranch (the party filter needs its alias);
      // selecting it is the rows query's business. This is exactly what
      // leftJoinAndSelect would have done.
      .addSelect('targetBranch')
      .leftJoinAndSelect('gi.provider', 'provider')
      .leftJoinAndSelect('gi.reasonRef', 'reasonRef')
      .leftJoinAndSelect('gi.location', 'location')
      .orderBy('gi.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // No `lines` join here — see TOTAL_AMOUNT_SUBQUERY.
    const totalsQb = this.buildQuery(dto, actor)
      .select('COUNT(*)', 'total')
      .addSelect(`COALESCE(SUM(${TOTAL_AMOUNT_SUBQUERY}), 0)`, 'totalAmount');

    const [data, totals] = await Promise.all([
      rowsQb.getMany(),
      totalsQb.getRawOne<TotalsRaw>(),
    ]);

    // Inline the resolved "Đối tượng"; TRANSFER_OUT rows keep targetBranch as
    // their party (counterparty is null there).
    await attachCounterparties(this.repo.manager, data, actor.organizationId);

    // Per-row Tổng tiền (see search-goods-receipts-v2.handler.ts for the same
    // fix + rationale): the list's money column used to be derived
    // client-side from `lines` (now dropped above). Reuse the same correlated
    // subquery as the footer total, scoped to just this page's ids.
    if (data.length) {
      const rowTotals = await this.repo
        .createQueryBuilder('gi')
        .select('gi.id', 'id')
        .addSelect(TOTAL_AMOUNT_SUBQUERY, 'totalAmount')
        .where('gi.id IN (:...ids)', { ids: data.map((row) => row.id) })
        .getRawMany<{ id: string; totalAmount: string }>();
      const totalById = new Map(
        rowTotals.map((row) => [row.id, Number(row.totalAmount)]),
      );
      for (const row of data) {
        row.totalAmount = totalById.get(row.id) ?? 0;
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
   * `targetBranch` is joined here rather than alongside the other eager
   * relations because PARTY_EXPRESSION references its alias — the totals query
   * needs the alias too. It is many-to-one, so it cannot multiply rows.
   */
  private buildQuery(
    dto: GoodsIssueSearchV2Dto,
    actor: ActorContext,
  ): SelectQueryBuilder<GoodsIssueEntity> {
    // Hide CANCELLED (no soft-delete column) — cancelled documents must not
    // reach the grid nor the footer total.
    const qb = this.repo
      .createQueryBuilder('gi')
      .leftJoin('gi.targetBranch', 'targetBranch')
      .where('gi.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('gi.status != :cancelled', {
        cancelled: GoodsIssueStatus.CANCELLED,
      });

    if (actor.branchId) {
      qb.andWhere('gi.branchId = :branchId', { branchId: actor.branchId });
    }

    new FilterBuilder(qb)
      .applyString('gi.documentNumber', dto.documentNumber)
      .applyString(PARTY_EXPRESSION, dto.party)
      .applyString('gi.notes', dto.notes)
      .applyString('gi.reason', dto.reason)
      .applyEnum('gi.purpose', dto.purpose?.value)
      .applyDateRange('gi.createdAt', dto.date)
      .applyCompare(TOTAL_AMOUNT_SUBQUERY, dto.totalAmount);

    return qb;
  }
}
