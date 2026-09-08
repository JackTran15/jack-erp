import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { TransferStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { StockTransferEntity } from '../stock-transfer.entity';
import { StockTransferSearchV2Dto } from '../dto/stock-transfer-search-v2.dto';
import { UserEntity } from '../../../auth/user.entity';
import {
  attachCounterparties,
  counterpartyNameSql,
} from '../../location/services/counterparty-name.util';
import { SearchStockTransfersV2Query } from './search-stock-transfers-v2.query';

/**
 * Correlated line total — Tổng tiền = SUM(line_value). Drives the server-side
 * `totalAmount` filter, the footer grand total, and the per-row `totalAmount`
 * on the rows query — none of which join `lines`.
 *
 * A correlated subquery rather than a join on purpose: joining `lines`
 * one-to-many would count a 5-line transfer five times in any SUM built over
 * it. Neither the rows query nor the totals query joins `lines` at all.
 */
const TOTAL_AMOUNT_SUBQUERY = `(SELECT COALESCE(SUM(l.line_value), 0)
   FROM stock_transfer_lines l WHERE l.transfer_id = st.id)`;

interface TotalsRaw {
  total: string;
  totalAmount: string;
}

/** Người vận chuyển — transporter user's full name (legacy fallback Đối tượng).
 *  `u.organization_id` is uuid (`UserEntity`) while `st.organization_id` is
 *  varchar (`BaseEntity`, inherited by `StockTransferEntity`); without the
 *  cast Postgres rejects `uuid = character varying` at plan time (ADR-04,
 *  same precedent as `search-deposit-recon-v2.handler.ts`). */
const TRANSPORTER_NAME_SUBQUERY = `(SELECT (u.first_name || ' ' || u.last_name)
   FROM users u WHERE u.id = st.transporter_user_id AND u.organization_id::text = st.organization_id)`;

/** Đối tượng (party) — counterparty (supplier/customer/employee), else the
 *  legacy transporter name for transfers created before the counterparty field. */
const PARTY_EXPRESSION = `COALESCE(${counterpartyNameSql('st')}, ${TRANSPORTER_NAME_SUBQUERY})`;

/** Ngày — transfer date, falling back to created date for legacy rows. */
const DATE_COLUMN = `COALESCE(st.transferred_at, st.created_at)`;

@QueryHandler(SearchStockTransfersV2Query)
export class SearchStockTransfersV2Handler
  implements IQueryHandler<SearchStockTransfersV2Query>
{
  constructor(
    @InjectRepository(StockTransferEntity)
    private readonly repo: Repository<StockTransferEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async execute({ dto, actor }: SearchStockTransfersV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // The master-detail "Chi tiết" panel fetches lines separately via
    // `/lines/search`; this query stays at the voucher level and sources
    // per-row `totalAmount` from TOTAL_AMOUNT_SUBQUERY instead of joining
    // `lines` (which would multiply rows for multi-line transfers).
    const rowsQb = this.buildQuery(dto, actor)
      .addSelect(TOTAL_AMOUNT_SUBQUERY, 'totalAmount')
      .orderBy('st.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // No `lines` join here — see TOTAL_AMOUNT_SUBQUERY.
    const totalsQb = this.buildQuery(dto, actor)
      .select('COUNT(*)', 'total')
      .addSelect(`COALESCE(SUM(${TOTAL_AMOUNT_SUBQUERY}), 0)`, 'totalAmount');

    const [{ entities: data, raw: rowsRaw }, totals] = await Promise.all([
      rowsQb.getRawAndEntities<{ totalAmount: string }>(),
      totalsQb.getRawOne<TotalsRaw>(),
    ]);

    // Inline the transporter ({ id, fullName }) + Tổng tiền (∑ line_value) per
    // row — batched to avoid N+1; mirrors StockTransferService.list().
    const userIds = Array.from(
      new Set(
        data
          .map((t) => t.transporterUserId)
          .filter((id): id is string => !!id),
      ),
    );
    const users = userIds.length
      ? await this.userRepo.find({
          where: userIds.map((id) => ({
            id,
            organizationId: actor.organizationId,
          })),
        })
      : [];
    const transporterById = new Map(
      users.map((u) => [
        u.id,
        { id: u.id, fullName: `${u.firstName} ${u.lastName}`.trim() },
      ]),
    );

    data.forEach((t, i) => {
      t.transporter = t.transporterUserId
        ? transporterById.get(t.transporterUserId) ?? null
        : null;
      t.totalAmount = Number(rowsRaw[i]?.totalAmount ?? 0);
    });

    // Inline the resolved "Đối tượng"; legacy transfers (no counterparty) keep
    // null and fall back to the transporter on the FE.
    await attachCounterparties(this.repo.manager, data, actor.organizationId);

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
    dto: StockTransferSearchV2Dto,
    actor: ActorContext,
  ): SelectQueryBuilder<StockTransferEntity> {
    // Org + branch scoped, hiding CANCELLED (the "Xóa"-ed reversal docs) so
    // they reach neither the grid nor the footer total.
    const qb = this.repo
      .createQueryBuilder('st')
      .where('st.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('st.status != :cancelled', {
        cancelled: TransferStatus.CANCELLED,
      });

    if (actor.branchId) {
      qb.andWhere('st.branchId = :branchId', { branchId: actor.branchId });
    }

    new FilterBuilder(qb)
      .applyString('st.documentNumber', dto.documentNumber)
      .applyString(PARTY_EXPRESSION, dto.party)
      .applyString('st.notes', dto.notes)
      .applyDateCompare(DATE_COLUMN, dto.date)
      .applyDateRange(DATE_COLUMN, dto.dateRange)
      .applyCompare(TOTAL_AMOUNT_SUBQUERY, dto.totalAmount);

    return qb;
  }
}
