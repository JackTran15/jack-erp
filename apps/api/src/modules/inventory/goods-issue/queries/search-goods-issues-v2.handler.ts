import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoodsIssueStatus } from '@erp/shared-interfaces';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { GoodsIssueEntity } from '../goods-issue.entity';
import {
  attachCounterparties,
  counterpartyNameSql,
} from '../../location/services/counterparty-name.util';
import { SearchGoodsIssuesV2Query } from './search-goods-issues-v2.query';

/**
 * Correlated line total — mirrors the client-side Tổng tiền calc
 * (SUM(quantity * unit_price)). Used only for the server-side `totalAmount`
 * filter; the returned rows still carry `lines` for the FE to total.
 */
const TOTAL_AMOUNT_SUBQUERY = `(SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
   FROM goods_issue_lines l WHERE l.goods_issue_id = gi.id)`;

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

    // Scope to the actor's active branch and hide CANCELLED (no soft-delete column).
    // Eager relations are joined explicitly so the row shape matches the
    // current find()-based list (provider, targetBranch, reasonRef, location,
    // lines + line item); the detail panel and view dialog rely on `lines`.
    const qb = this.repo
      .createQueryBuilder('gi')
      .leftJoinAndSelect('gi.provider', 'provider')
      .leftJoinAndSelect('gi.targetBranch', 'targetBranch')
      .leftJoinAndSelect('gi.reasonRef', 'reasonRef')
      .leftJoinAndSelect('gi.location', 'location')
      .leftJoinAndSelect('gi.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'lineItem')
      .leftJoinAndSelect('lines.location', 'lineLocation')
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

    qb.orderBy('gi.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Inline the resolved "Đối tượng"; TRANSFER_OUT rows keep targetBranch as
    // their party (counterparty is null there).
    await attachCounterparties(this.repo.manager, data, actor.organizationId);

    return { data, total, page, limit };
  }
}
