import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { GoodsReceiptEntity } from '../goods-receipt.entity';
import { GoodsReceiptLineEntity } from '../goods-receipt-line.entity';
import { GoodsReceiptLineSearchV2Dto } from '../dto/goods-receipt-line-search-v2.dto';
import { SearchGoodsReceiptLinesV2Query } from './search-goods-receipt-lines-v2.query';

/**
 * Thành tiền, as the grid renders it: quantity times unit price.
 *
 * Same expression, same reasoning and same measurement as the issue side: the
 * stored `line_total` agrees by construction (every write path computes exactly
 * this product — `makeLine`, the v2 create handler, and the stock-take generated
 * receipt), and on a production snapshot not one of 162,776 rows differs from it
 * by more than a cent. The product is still what to filter and total on, because
 * it is what the cell displays.
 *
 * Note the discount and tax columns are NOT part of it. `line_total` is the
 * pre-discount, pre-tax line amount here, so "Thành tiền" means the same thing
 * on both voucher types.
 *
 * Real column names against the entity alias rather than property paths —
 * TypeORM rewrites `alias.property` inside raw fragments, but not reliably once
 * the fragment is an expression.
 */
const LINE_AMOUNT_EXPRESSION = 'line.quantity * line.unit_price';

interface LineTotalsRaw {
  total: string;
  totalQuantity: string;
  totalAmount: string;
}

/**
 * One page of a goods receipt's lines, filtered server-side (ADR-06). Mirror of
 * `SearchGoodsIssueLinesV2Handler`, replacing `GoodsReceiptService.getLines`.
 *
 * Two things differ from the issue side and both are deliberate:
 *
 * 1. `goods_receipt_lines` carries its own `organization_id`, and the replaced
 *    `getLines` filtered on it alongside the parent id. That predicate is kept.
 *    It is redundant with the parent check in practice, but dropping a tenancy
 *    filter because it looks redundant is how tenancy filters get dropped.
 * 2. Order is `line_no ASC`, which on this table only exists as of ADR-05. It
 *    replaced `created_at ASC`, which was never a real ordering here — on
 *    production data 463 of 627 vouchers share timestamps across their lines,
 *    the largest being 5,000 lines on a single one.
 */
@QueryHandler(SearchGoodsReceiptLinesV2Query)
export class SearchGoodsReceiptLinesV2Handler
  implements IQueryHandler<SearchGoodsReceiptLinesV2Query>
{
  constructor(
    @InjectRepository(GoodsReceiptEntity)
    private readonly receiptRepo: Repository<GoodsReceiptEntity>,
    @InjectRepository(GoodsReceiptLineEntity)
    private readonly lineRepo: Repository<GoodsReceiptLineEntity>,
  ) {}

  async execute({ goodsReceiptId, dto, actor }: SearchGoodsReceiptLinesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    const receipt = await this.receiptRepo.findOne({
      where: {
        id: goodsReceiptId,
        organizationId: actor.organizationId,
        ...(actor.branchId ? { branchId: actor.branchId } : {}),
      },
      loadEagerRelations: false,
    });
    if (!receipt) {
      throw new NotFoundException(
        `Phiếu nhập kho ${goodsReceiptId} không tìm thấy`,
      );
    }

    // `item` and `location` are eager on the entity, but a query builder never
    // honours that — join them explicitly or the web grid loses the SKU, the
    // name, the unit and the bin code.
    const rowsQb = this.buildQuery(goodsReceiptId, dto, actor)
      .leftJoinAndSelect('line.location', 'location')
      .addSelect('item')
      .orderBy('line.lineNo', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    // Totals follow the same predicate as the rows (ADR-08).
    const totalsQb = this.buildQuery(goodsReceiptId, dto, actor)
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
   * Voucher scope plus every column filter, built twice per request (rows,
   * totals) so the footer can never disagree with the grid above it.
   *
   * `items` is joined here rather than only on the rows query because both
   * string filters address its columns and the totals query needs the same
   * alias. Many-to-one, so it cannot multiply rows and inflate COUNT.
   */
  private buildQuery(
    goodsReceiptId: string,
    dto: GoodsReceiptLineSearchV2Dto,
    actor: ActorContext,
  ): SelectQueryBuilder<GoodsReceiptLineEntity> {
    const qb = this.lineRepo
      .createQueryBuilder('line')
      .leftJoin('line.item', 'item')
      .where('line.goodsReceiptId = :goodsReceiptId', { goodsReceiptId })
      .andWhere('line.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('item.code', dto.itemCode)
      .applyString('item.name', dto.itemName)
      // Column names, not property paths — see LINE_AMOUNT_EXPRESSION.
      .applyCompare('line.quantity', dto.quantity)
      .applyCompare('line.unit_price', dto.unitPrice)
      .applyCompare(LINE_AMOUNT_EXPRESSION, dto.lineTotal);

    return qb;
  }
}
