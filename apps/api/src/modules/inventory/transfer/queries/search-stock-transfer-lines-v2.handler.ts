import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockTransferEntity } from '../stock-transfer.entity';
import { StockTransferLineEntity } from '../stock-transfer-line.entity';
import { SearchStockTransferLinesV2Query } from './search-stock-transfer-lines-v2.query';

/**
 * One page of a stock transfer's lines (ADR-04). Mirror of
 * `SearchGoodsReceiptLinesV2Handler`, with two things different:
 *
 * 1. No column filters this phase — the "Chi tiết" panel only paginates
 *    (`PurchaseOrdersPage.tsx:986-989`), so there is nothing to build a
 *    `FilterBuilder` predicate out of.
 * 2. Each line carries TWO storages and TWO locations (source + destination),
 *    all four `eager: true` on the entity (`stock-transfer-line.entity.ts:83-99`)
 *    along with `item`. A query builder never honours `eager` — every one of
 *    those five relations is joined explicitly, or the panel silently loses a
 *    column (`StockTransferPage.tsx:665` renders all of them).
 *
 * Scope predicate matches `StockTransferService.getById` exactly:
 * `organizationId` only, no `branchId`. Tightening this would 404 an
 * inter-branch transfer for the very person who created it.
 */
@QueryHandler(SearchStockTransferLinesV2Query)
export class SearchStockTransferLinesV2Handler
  implements IQueryHandler<SearchStockTransferLinesV2Query>
{
  constructor(
    @InjectRepository(StockTransferEntity)
    private readonly transferRepo: Repository<StockTransferEntity>,
    @InjectRepository(StockTransferLineEntity)
    private readonly lineRepo: Repository<StockTransferLineEntity>,
  ) {}

  async execute({
    transferId,
    dto,
    actor,
  }: SearchStockTransferLinesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    // 404 before pagination — an id outside the actor's organization must not
    // return an empty page, which would leak whether the voucher exists.
    const transfer = await this.transferRepo.findOne({
      where: { id: transferId, organizationId: actor.organizationId },
      loadEagerRelations: false,
    });
    if (!transfer) {
      throw new NotFoundException(`Stock transfer ${transferId} not found`);
    }

    const baseQb = () =>
      this.lineRepo
        .createQueryBuilder('line')
        .leftJoin('line.item', 'item')
        .addSelect('item')
        .leftJoin('line.sourceStorage', 'sourceStorage')
        .addSelect('sourceStorage')
        .leftJoin('line.destinationStorage', 'destinationStorage')
        .addSelect('destinationStorage')
        .leftJoin('line.sourceLocation', 'sourceLocation')
        .addSelect('sourceLocation')
        .leftJoin('line.destinationLocation', 'destinationLocation')
        .addSelect('destinationLocation')
        .where('line.transferId = :transferId', { transferId });

    const [data, total] = await Promise.all([
      baseQb()
        .orderBy('line.lineNo', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
      baseQb().getCount(),
    ]);

    return { data, page, limit, total };
  }
}
