import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { ActorContext } from "../../../../common/decorators/actor-context.decorator";
import { FilterBuilder } from "../../../../common/filters/filter.builder";
import { GoodsReceiptEntity } from "../goods-receipt.entity";
import { GoodsReceiptSearchV2Dto } from "../dto/goods-receipt-search-v2.dto";
import {
  attachCounterparties,
  attachPurchasingEmployees,
  counterpartyNameSql,
} from "../../location/services/counterparty-name.util";
import { SearchGoodsReceiptsV2Query } from "./search-goods-receipts-v2.query";

/**
 * Correlated line total — mirrors the client-side Tổng tiền calc
 * (SUM(quantity * unit_price)). Drives both the server-side `totalAmount`
 * filter and the footer grand total, so the two can never disagree on what
 * "Tổng tiền" means.
 *
 * A correlated subquery rather than a join on purpose: the rows query joins
 * `lines` one-to-many, and summing over that join would count a 5-line receipt
 * five times. The totals query never joins `lines` at all.
 */
const TOTAL_AMOUNT_SUBQUERY = `(SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
   FROM goods_receipt_lines l WHERE l.goods_receipt_id = gr.id)`;

interface TotalsRaw {
  total: string;
  totalAmount: string;
}

@QueryHandler(SearchGoodsReceiptsV2Query)
export class SearchGoodsReceiptsV2Handler implements IQueryHandler<SearchGoodsReceiptsV2Query> {
  constructor(
    @InjectRepository(GoodsReceiptEntity)
    private readonly repo: Repository<GoodsReceiptEntity>,
  ) {}

  async execute({ dto, actor }: SearchGoodsReceiptsV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Eager relations are joined explicitly so the row shape is identical to the
    // current find()-based list (provider, location). Line detail is fetched
    // lazily via GET /goods-receipts/:id/lines once a document is opened, not
    // as part of the list response.
    const rowsQb = this.buildQuery(dto, actor)
      .leftJoinAndSelect("gr.provider", "provider")
      .leftJoinAndSelect("gr.location", "location")
      .orderBy("gr.receivedAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    // No `lines` join here — see TOTAL_AMOUNT_SUBQUERY.
    const totalsQb = this.buildQuery(dto, actor)
      .select("COUNT(*)", "total")
      .addSelect(`COALESCE(SUM(${TOTAL_AMOUNT_SUBQUERY}), 0)`, "totalAmount");

    const [data, totals] = await Promise.all([
      rowsQb.getMany(),
      totalsQb.getRawOne<TotalsRaw>(),
    ]);

    // Inline the resolved "Đối tượng" so customer/employee counterparties (no
    // provider join) render their name instead of "—".
    await attachCounterparties(this.repo.manager, data, actor.organizationId);
    await attachPurchasingEmployees(
      this.repo.manager,
      data,
      actor.organizationId,
    );

    // Per-row Tổng tiền: the list's money column used to be derived client-side
    // from `lines` (now dropped, see rowsQb above). Reuse the same correlated
    // subquery as the footer total, scoped to just this page's ids, so the
    // column keeps working without joining `lines`/`item`/`location` per line.
    if (data.length) {
      const rowTotals = await this.repo
        .createQueryBuilder("gr")
        .select("gr.id", "id")
        .addSelect(TOTAL_AMOUNT_SUBQUERY, "totalAmount")
        .where("gr.id IN (:...ids)", { ids: data.map((row) => row.id) })
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
   */
  private buildQuery(
    dto: GoodsReceiptSearchV2Dto,
    actor: ActorContext,
  ): SelectQueryBuilder<GoodsReceiptEntity> {
    const qb = this.repo
      .createQueryBuilder("gr")
      .where("gr.organizationId = :orgId", { orgId: actor.organizationId });

    if (actor.branchId) {
      qb.andWhere("gr.branchId = :branchId", { branchId: actor.branchId });
    }

    new FilterBuilder(qb)
      .applyString("gr.documentNumber", dto.documentNumber)
      .applyString(counterpartyNameSql("gr"), dto.party)
      .applyString("gr.description", dto.description)
      .applyString("gr.reason", dto.reason)
      .applyEnum("gr.purpose", dto.purpose?.value)
      .applyDateRange("gr.receivedAt", dto.date)
      .applyCompare(TOTAL_AMOUNT_SUBQUERY, dto.totalAmount);

    if (dto.purposes?.length) {
      qb.andWhere("gr.purpose IN (:...purposes)", {
        purposes: dto.purposes,
      });
    }
    if (dto.excludePurposes?.length) {
      qb.andWhere("gr.purpose NOT IN (:...excludePurposes)", {
        excludePurposes: dto.excludePurposes,
      });
    }

    return qb;
  }
}
