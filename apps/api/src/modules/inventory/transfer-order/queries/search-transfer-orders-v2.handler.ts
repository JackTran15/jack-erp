import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { StringFilterDto } from '../../../../common/filters/filter.dto';
import { TransferOrderEntity } from '../transfer-order.entity';
import { SearchTransferOrdersV2Query } from './search-transfer-orders-v2.query';

/** Ngày (date) — requested date if set, else the creation date (matches the FE cell). */
const DATE_EXPRESSION = `COALESCE(to_.requested_date, to_.created_at)`;

@QueryHandler(SearchTransferOrdersV2Query)
export class SearchTransferOrdersV2Handler
  implements IQueryHandler<SearchTransferOrdersV2Query>
{
  constructor(
    @InjectRepository(TransferOrderEntity)
    private readonly repo: Repository<TransferOrderEntity>,
  ) {}

  async execute({ dto, actor }: SearchTransferOrdersV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Source/destination branch ids are varchar columns with no entity relation,
    // so resolve the branch-name filters to id lists up front instead of joining
    // `branches`. Joining a second table onto the same query as the `lines`
    // collection breaks TypeORM's paginated distinct-id subquery; pre-resolving
    // keeps the main query a clean collection-join + pagination (like goods-issue).
    const srcBranchIds = await this.matchingBranchIds(
      actor.organizationId,
      dto.sourceBranch,
    );
    const dstBranchIds = await this.matchingBranchIds(
      actor.organizationId,
      dto.destinationBranch,
    );

    // Lines + line item joined explicitly so the row shape matches the
    // find()-based list (the FE detail panel reads `lines` off the row).
    const qb = this.repo
      .createQueryBuilder('to_')
      .leftJoinAndSelect('to_.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'lineItem')
      .where('to_.organizationId = :orgId', { orgId: actor.organizationId });

    new FilterBuilder(qb)
      .applyString('to_.documentNumber', dto.documentNumber)
      .applyEnum('to_.status', dto.status?.value)
      .applyString('to_.notes', dto.notes)
      .applyDateRange(DATE_EXPRESSION, dto.date);

    this.applyBranchFilter(qb, 'to_.source_branch_id', srcBranchIds, 'srcBranchIds');
    this.applyBranchFilter(
      qb,
      'to_.destination_branch_id',
      dstBranchIds,
      'dstBranchIds',
    );

    qb.orderBy('to_.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  /** Branch ids (as text) whose name matches the filter, org-scoped. null = filter absent. */
  private async matchingBranchIds(
    orgId: string,
    filter?: StringFilterDto,
  ): Promise<string[] | null> {
    if (!filter?.value?.trim()) return null;
    const sub = this.repo.manager
      .createQueryBuilder()
      .select('b.id::text', 'id')
      .from('branches', 'b')
      .where('b.organization_id = :orgId', { orgId });
    new FilterBuilder(sub).applyString('b.name', filter);
    const rows = await sub.getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  private applyBranchFilter(
    qb: SelectQueryBuilder<TransferOrderEntity>,
    col: string,
    ids: string[] | null,
    paramKey: string,
  ): void {
    if (ids === null) return; // no filter
    // Filter set but nothing matched → force an empty result set.
    if (ids.length === 0) {
      qb.andWhere('1 = 0');
      return;
    }
    qb.andWhere(`${col} IN (:...${paramKey})`, { [paramKey]: ids });
  }
}
