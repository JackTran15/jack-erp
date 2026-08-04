import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PromotionProgramSummary } from '@erp/shared-interfaces';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { DateRangeFilterDto } from '../../../../common/filters/filter.dto';
import { PromotionProgramEntity } from '../../infrastructure/entities';
import { toSummary } from '../dto/promotion-program.response.dto';
import { SearchPromotionsV2Query } from './search-promotions-v2.query';

export interface SearchPromotionsV2Result {
  data: PromotionProgramSummary[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Date-range filter that treats a NULL date as "matches every period".
 *
 * `to` stays inclusive of the whole day, matching `FilterBuilder.applyDateRange`
 * — the two paths must not drift apart.
 */
function applyNullableDateRange(
  qb: SelectQueryBuilder<PromotionProgramEntity>,
  column: string,
  paramPrefix: string,
  filter?: DateRangeFilterDto,
): void {
  if (!filter) return;

  if (filter.from) {
    qb.andWhere(`(${column} IS NULL OR ${column} >= :${paramPrefix}From)`, {
      [`${paramPrefix}From`]: filter.from,
    });
  }

  if (filter.to) {
    qb.andWhere(
      `(${column} IS NULL OR ${column} < (:${paramPrefix}To::date + INTERVAL '1 day'))`,
      { [`${paramPrefix}To`]: filter.to },
    );
  }
}

@QueryHandler(SearchPromotionsV2Query)
export class SearchPromotionsV2Handler implements IQueryHandler<SearchPromotionsV2Query> {
  constructor(
    @InjectRepository(PromotionProgramEntity)
    private readonly repo: Repository<PromotionProgramEntity>,
  ) {}

  async execute({ dto, actor }: SearchPromotionsV2Query): Promise<SearchPromotionsV2Result> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('p.deletedAt IS NULL');

    // promotion_programs.branch_id is the creator's branch, not the promotion's
    // applicable scope — that scope lives in promotion_branches (empty = whole chain).
    if (actor.branchId) {
      qb.andWhere(
        `(
          NOT EXISTS (SELECT 1 FROM promotion_branches pb WHERE pb.program_id = p.id)
          OR EXISTS (SELECT 1 FROM promotion_branches pb WHERE pb.program_id = p.id AND pb.branch_id = :branchId)
        )`,
        { branchId: actor.branchId },
      );
    }

    // No default status filter here — the "Tracking only" default (FR-004) is
    // a FE-side chip the user can clear with one click, not a server-side hide.
    new FilterBuilder(qb)
      .applyString('p.name', dto.name)
      .applyString('p.description', dto.description)
      .applyEnum('p.type', dto.type?.value)
      .applyEnum('p.status', dto.status?.value)
      .applyEnum('p.applyTo', dto.applyTo?.value);

    // Open-ended programs belong to every period, so the period filter must keep
    // NULL dates. FilterBuilder.applyDateRange emits a plain `col >= :from`, and
    // `NULL >= x` is NULL — it would drop every open-ended program (BR-003 allows
    // both dates to be null). Handled here rather than in FilterBuilder: that
    // helper is shared with modules whose date columns are NOT NULL, where the
    // current semantics are correct.
    applyNullableDateRange(qb, 'p.startDate', 'startDate', dto.startDate);
    applyNullableDateRange(qb, 'p.endDate', 'endDate', dto.endDate);

    // priority ASC (not createdAt DESC like other v2 searches) — priority is
    // the real application order (BR-001), users need to see it as such.
    qb.orderBy('p.priority', 'ASC')
      .addOrderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data: data.map(toSummary), total, page, limit };
  }
}
