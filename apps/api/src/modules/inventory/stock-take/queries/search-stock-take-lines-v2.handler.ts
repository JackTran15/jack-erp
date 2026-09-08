import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockTakeEntity } from '../stock-take.entity';
import { StockTakeLineEntity } from '../stock-take-line.entity';
import { SearchStockTakeLinesV2Query } from './search-stock-take-lines-v2.query';

/**
 * One page of a stock take's lines (ADR-04). Mirror of
 * `SearchStockTransferLinesV2Handler`, with two things different:
 *
 * 1. Scope predicate matches `StockTakeService.findOrFail` exactly:
 *    `organizationId` AND `branchId` when the actor carries one
 *    (`stock-take.service.ts:1679-1688`) — the route carries
 *    `@RequireBranchScope()`, unlike the stock-transfer sibling which is
 *    organization-only. Tightening/loosening this would either leak or
 *    wrongly 404 a stock take.
 * 2. Each line carries `item` and `location`, both `eager: true` on the
 *    entity (`stock-take-line.entity.ts:90-94`). A query builder never
 *    honours `eager` — both relations are joined explicitly, or the panel
 *    silently loses a column (`StockTakeDetailPanel.tsx:106-115` renders
 *    `item.code`, `item.name`, `item.unit`, `location.code`).
 */
@QueryHandler(SearchStockTakeLinesV2Query)
export class SearchStockTakeLinesV2Handler
  implements IQueryHandler<SearchStockTakeLinesV2Query>
{
  constructor(
    @InjectRepository(StockTakeEntity)
    private readonly stockTakeRepo: Repository<StockTakeEntity>,
    @InjectRepository(StockTakeLineEntity)
    private readonly lineRepo: Repository<StockTakeLineEntity>,
  ) {}

  async execute({ stockTakeId, dto, actor }: SearchStockTakeLinesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    // 404 before pagination — an id outside the actor's organization/branch
    // must not return an empty page, which would leak whether the voucher
    // exists.
    const stockTake = await this.stockTakeRepo.findOne({
      where: {
        id: stockTakeId,
        organizationId: actor.organizationId,
        ...(actor.branchId ? { branchId: actor.branchId } : {}),
      },
      loadEagerRelations: false,
    });
    if (!stockTake) {
      throw new NotFoundException(`Stock take ${stockTakeId} not found`);
    }

    const baseQb = () =>
      this.lineRepo
        .createQueryBuilder('line')
        .leftJoin('line.item', 'item')
        .addSelect('item')
        .leftJoin('line.location', 'location')
        .addSelect('location')
        .where('line.stockTakeId = :stockTakeId', { stockTakeId });

    // Footer totals over the WHOLE voucher (AC-27), not the page(s) loaded so
    // far. A plain SELECT scoped by stockTakeId — no join against `lines`
    // beyond the base row itself, so no row multiplication to guard against.
    //
    // `countedTotal`/`varianceTotal` only fold in lines that have been
    // counted (`countedQty IS NOT NULL`), mirroring the FE loop this replaces
    // (`StockTakeDetailPanel.tsx:111-125`); `expectedTotal` sums every line
    // regardless of count status.
    const totalsQb = () =>
      this.lineRepo
        .createQueryBuilder('line')
        .select('COALESCE(SUM(line.expectedQty), 0)', 'expectedTotal')
        .addSelect(
          'COALESCE(SUM(line.countedQty) FILTER (WHERE line.countedQty IS NOT NULL), 0)',
          'countedTotal',
        )
        .addSelect(
          'COALESCE(SUM(line.countedQty - line.expectedQty) FILTER (WHERE line.countedQty IS NOT NULL), 0)',
          'varianceTotal',
        )
        .where('line.stockTakeId = :stockTakeId', { stockTakeId });

    const [data, total, totalsRaw] = await Promise.all([
      baseQb()
        .orderBy('line.lineNo', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
      baseQb().getCount(),
      totalsQb().getRawOne<{
        expectedTotal: string;
        countedTotal: string;
        varianceTotal: string;
      }>(),
    ]);

    const totals = {
      expectedTotal: Number(totalsRaw?.expectedTotal ?? 0),
      countedTotal: Number(totalsRaw?.countedTotal ?? 0),
      varianceTotal: Number(totalsRaw?.varianceTotal ?? 0),
    };

    return { data, page, limit, total, totals };
  }
}
