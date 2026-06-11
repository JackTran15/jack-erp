import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferStatus } from '@erp/shared-interfaces';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { StockTransferEntity } from '../stock-transfer.entity';
import { UserEntity } from '../../../auth/user.entity';
import { SearchStockTransfersV2Query } from './search-stock-transfers-v2.query';

/**
 * Correlated line total — Tổng tiền = SUM(line_value). Used only for the
 * server-side `totalAmount` filter; the returned rows still carry `lines`, and
 * the handler attaches `totalAmount` per row from those lines.
 */
const TOTAL_AMOUNT_SUBQUERY = `(SELECT COALESCE(SUM(l.line_value), 0)
   FROM stock_transfer_lines l WHERE l.transfer_id = st.id)`;

/** Đối tượng (party) — the transporter user's full name, via correlated subquery. */
const TRANSPORTER_NAME_SUBQUERY = `(SELECT (u.first_name || ' ' || u.last_name)
   FROM users u WHERE u.id = st.transporter_user_id AND u.organization_id = st.organization_id)`;

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

    // Org + branch scoped, hiding CANCELLED (the "Xóa"-ed reversal docs).
    // Lines and their item/storage/location relations are joined explicitly so
    // each row carries the full `lines` the master-detail "Chi tiết" panel reads.
    const qb = this.repo
      .createQueryBuilder('st')
      .leftJoinAndSelect('st.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'lineItem')
      .leftJoinAndSelect('lines.sourceStorage', 'lineSrcStorage')
      .leftJoinAndSelect('lines.destinationStorage', 'lineDstStorage')
      .leftJoinAndSelect('lines.sourceLocation', 'lineSrcLocation')
      .leftJoinAndSelect('lines.destinationLocation', 'lineDstLocation')
      .where('st.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('st.status != :cancelled', {
        cancelled: TransferStatus.CANCELLED,
      });

    if (actor.branchId) {
      qb.andWhere('st.branchId = :branchId', { branchId: actor.branchId });
    }

    new FilterBuilder(qb)
      .applyString('st.documentNumber', dto.documentNumber)
      .applyString(TRANSPORTER_NAME_SUBQUERY, dto.party)
      .applyString('st.notes', dto.notes)
      .applyDateCompare(DATE_COLUMN, dto.date)
      .applyDateRange(DATE_COLUMN, dto.dateRange)
      .applyCompare(TOTAL_AMOUNT_SUBQUERY, dto.totalAmount);

    qb.orderBy('st.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

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

    for (const t of data) {
      t.transporter = t.transporterUserId
        ? transporterById.get(t.transporterUserId) ?? null
        : null;
      t.totalAmount = (t.lines ?? []).reduce(
        (sum, l) => sum + Number(l.lineValue ?? 0),
        0,
      );
    }

    return { data, total, page, limit };
  }
}
