import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { GoodsIssueEntity } from '../goods-issue.entity';
import { GoodsIssueLineEntity } from '../goods-issue-line.entity';
import { GoodsIssueLineSearchV2Dto } from '../dto/goods-issue-line-search-v2.dto';
import { SearchGoodsIssueLinesV2Query } from './search-goods-issue-lines-v2.query';

/**
 * Thành tiền, as the grid renders it: quantity times unit price.
 *
 * The table also stores `line_total`, and the two agree by construction —
 * every write path computes it as exactly this product
 * (`goods-issue.service.ts` lines 233, 361 and 500; the v2 create handler
 * delegates to `create`, so it goes through the same code). This expression is
 * still the one to filter and total on, because it is what the column shows and
 * what the voucher-list search already means by "Tổng tiền". Using the stored
 * column instead would make the filter, the footer and the cell three separate
 * definitions that only happen to coincide today.
 *
 * Written with real column names against the entity alias rather than property
 * paths. That is the pattern the replaced `getLines` used for its own totals
 * (`COALESCE(SUM(l.line_total), 0)`) and it is the one that behaves predictably:
 * TypeORM rewrites `alias.property` inside raw fragments, but not reliably once
 * the fragment is an expression, so anything beyond a bare column is safer
 * spelled the way the database spells it.
 */
const LINE_AMOUNT_EXPRESSION = 'line.quantity * line.unit_price';

interface LineTotalsRaw {
  total: string;
  totalQuantity: string;
  totalAmount: string;
}

/**
 * One page of a goods issue's lines, filtered server-side (ADR-06).
 *
 * Replaces `GoodsIssueService.getLines`, whose only knob was pagination. The
 * grid's header filters used to run in the browser over whatever rows it had
 * been handed, which was the whole voucher — correct until the grid was
 * paginated, at which point "filter" silently came to mean "filter this page".
 * Pushing the predicate down here is the only way to filter the voucher while
 * still shipping one page of it.
 *
 * Order is `line_no ASC`, fixed here and not reachable from the request: the
 * ordinal is the order the user typed the voucher in, and a voucher grid that
 * can be re-sorted stops matching the paper document it is checked against.
 */
@QueryHandler(SearchGoodsIssueLinesV2Query)
export class SearchGoodsIssueLinesV2Handler
  implements IQueryHandler<SearchGoodsIssueLinesV2Query>
{
  constructor(
    @InjectRepository(GoodsIssueEntity)
    private readonly issueRepo: Repository<GoodsIssueEntity>,
    @InjectRepository(GoodsIssueLineEntity)
    private readonly lineRepo: Repository<GoodsIssueLineEntity>,
  ) {}

  async execute({ goodsIssueId, dto, actor }: SearchGoodsIssueLinesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    // Existence and scope in one lean read: `loadEagerRelations: false` so
    // proving the voucher is in scope does not drag its whole line collection
    // along, which is the cost this endpoint exists to avoid.
    const issue = await this.issueRepo.findOne({
      where: {
        id: goodsIssueId,
        organizationId: actor.organizationId,
        ...(actor.branchId ? { branchId: actor.branchId } : {}),
      },
      loadEagerRelations: false,
    });
    if (!issue) {
      throw new NotFoundException(
        `Phiếu xuất hàng ${goodsIssueId} không tìm thấy`,
      );
    }

    // `item` and `location` are declared eager on the entity, but a query
    // builder never honours that — they have to be joined explicitly or the web
    // grid loses the SKU, the name, the unit and the bin code.
    const rowsQb = this.buildQuery(goodsIssueId, dto)
      .leftJoinAndSelect('line.location', 'location')
      .addSelect('item')
      .orderBy('line.lineNo', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    // Totals follow the same predicate as the rows (ADR-08): filter to three
    // lines and the footer answers "what are these three worth", which is the
    // question the filter was asked. With no filter it is the whole voucher,
    // exactly as before.
    const totalsQb = this.buildQuery(goodsIssueId, dto)
      .select('COUNT(*)', 'total')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'totalQuantity')
      .addSelect(`COALESCE(SUM(${LINE_AMOUNT_EXPRESSION}), 0)`, 'totalAmount');

    const [data, totals] = await Promise.all([
      rowsQb.getMany(),
      totalsQb.getRawOne<LineTotalsRaw>(),
    ]);

    return {
      data,
      total: Number(totals?.total ?? 0),
      page,
      limit,
      totals: {
        totalQuantity: Number(totals?.totalQuantity ?? 0),
        totalAmount: Number(totals?.totalAmount ?? 0),
      },
    };
  }

  /**
   * Voucher scope plus every column filter. Built twice per request (rows,
   * totals) so the footer can never disagree with the grid above it.
   *
   * `items` is joined here rather than only on the rows query because the two
   * string filters address its columns, and the totals query needs the same
   * alias. It is many-to-one, so it cannot multiply rows and inflate COUNT.
   */
  private buildQuery(
    goodsIssueId: string,
    dto: GoodsIssueLineSearchV2Dto,
  ): SelectQueryBuilder<GoodsIssueLineEntity> {
    const qb = this.lineRepo
      .createQueryBuilder('line')
      .leftJoin('line.item', 'item')
      .where('line.goodsIssueId = :goodsIssueId', { goodsIssueId });

    new FilterBuilder(qb)
      .applyString('item.code', dto.itemCode)
      .applyString('item.name', dto.itemName)
      // Column names, not property paths — see LINE_AMOUNT_EXPRESSION.
      // `quantity` happens to spell the same either way.
      .applyCompare('line.quantity', dto.quantity)
      .applyCompare('line.unit_price', dto.unitPrice)
      .applyCompare(LINE_AMOUNT_EXPRESSION, dto.lineTotal);

    return qb;
  }
}
