import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { GoodsReceiptEntity } from '../goods-receipt.entity';
import {
  attachCounterparties,
  counterpartyNameSql,
} from '../../location/services/counterparty-name.util';
import { SearchGoodsReceiptsV2Query } from './search-goods-receipts-v2.query';

/**
 * Correlated line total — mirrors the client-side Tổng tiền calc
 * (SUM(quantity * unit_price)). Used only for the server-side `totalAmount`
 * filter; the returned rows still carry `lines`, so the FE computes the
 * displayed total exactly as before.
 */
const TOTAL_AMOUNT_SUBQUERY = `(SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
   FROM goods_receipt_lines l WHERE l.goods_receipt_id = gr.id)`;

@QueryHandler(SearchGoodsReceiptsV2Query)
export class SearchGoodsReceiptsV2Handler
  implements IQueryHandler<SearchGoodsReceiptsV2Query>
{
  constructor(
    @InjectRepository(GoodsReceiptEntity)
    private readonly repo: Repository<GoodsReceiptEntity>,
  ) {}

  async execute({ dto, actor }: SearchGoodsReceiptsV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Scope the list to the actor's active branch. Eager relations are joined explicitly so the
    // row shape is identical to the current find()-based list (provider,
    // location, lines + line item/location); the detail panel and view dialog
    // rely on `lines`.
    const qb = this.repo
      .createQueryBuilder('gr')
      .leftJoinAndSelect('gr.provider', 'provider')
      .leftJoinAndSelect('gr.location', 'location')
      .leftJoinAndSelect('gr.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'lineItem')
      .leftJoinAndSelect('lines.location', 'lineLocation')
      .where('gr.organizationId = :orgId', { orgId: actor.organizationId });

    if (actor.branchId) {
      qb.andWhere('gr.branchId = :branchId', { branchId: actor.branchId });
    }

    new FilterBuilder(qb)
      .applyString('gr.documentNumber', dto.documentNumber)
      .applyString(counterpartyNameSql('gr'), dto.party)
      .applyString('gr.description', dto.description)
      .applyString('gr.reason', dto.reason)
      .applyEnum('gr.purpose', dto.purpose?.value)
      .applyDateRange('gr.receivedAt', dto.date)
      .applyCompare(TOTAL_AMOUNT_SUBQUERY, dto.totalAmount);

    qb.orderBy('gr.receivedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Inline the resolved "Đối tượng" so customer/employee counterparties (no
    // provider join) render their name instead of "—".
    await attachCounterparties(this.repo.manager, data, actor.organizationId);

    return { data, total, page, limit };
  }
}
