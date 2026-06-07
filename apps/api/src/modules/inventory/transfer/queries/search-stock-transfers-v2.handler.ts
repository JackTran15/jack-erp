import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { StockTransferEntity } from '../stock-transfer.entity';
import { StockTransferLineEntity } from '../stock-transfer-line.entity';
import { SearchStockTransfersV2Query } from './search-stock-transfers-v2.query';

@QueryHandler(SearchStockTransfersV2Query)
export class SearchStockTransfersV2Handler
  implements IQueryHandler<SearchStockTransfersV2Query>
{
  constructor(
    @InjectRepository(StockTransferEntity)
    private readonly repo: Repository<StockTransferEntity>,
  ) {}

  async execute({ dto, actor }: SearchStockTransfersV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Org-scoped — mirrors StockTransferService.list() (no soft-delete column,
    // current FE list never passes a branchId). Source/destination locations are
    // plain UUID columns (no relation), so join LocationEntity on those ids to
    // filter/return the human-readable names. `lines` is fetched in a SEPARATE
    // query below rather than joined here: a collection join on the same query as
    // these raw location joins + pagination breaks TypeORM's distinct-id subquery.
    const qb = this.repo
      .createQueryBuilder('st')
      .leftJoin('locations', 'srcLoc', 'srcLoc.id = st.sourceLocationId')
      .leftJoin('locations', 'dstLoc', 'dstLoc.id = st.destinationLocationId')
      .addSelect('srcLoc.name', 'st_sourceLocationName')
      .addSelect('dstLoc.name', 'st_destinationLocationName')
      .where('st.organizationId = :orgId', { orgId: actor.organizationId });

    new FilterBuilder(qb)
      .applyString('st.documentNumber', dto.documentNumber)
      .applyEnum('st.status', dto.status?.value)
      .applyString('srcLoc.name', dto.sourceLocation)
      .applyString('dstLoc.name', dto.destinationLocation)
      .applyString('st.notes', dto.notes)
      .applyDateRange('st.createdAt', dto.date);

    qb.orderBy('st.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Raw rows carry the joined location names (aliased st_*); 1:1 with entities
    // since no collection is joined.
    const { entities, raw } = await qb.getRawAndEntities();
    const total = await qb.getCount();

    const linesByTransfer = await this.loadLines(entities.map((e) => e.id));

    const data = entities.map((entity, i) => ({
      ...entity,
      lines: linesByTransfer.get(entity.id) ?? [],
      sourceLocationName: raw[i]?.st_sourceLocationName ?? null,
      destinationLocationName: raw[i]?.st_destinationLocationName ?? null,
    }));

    return { data, total, page, limit };
  }

  /** Load all lines for the page's transfers, grouped by transferId. */
  private async loadLines(
    transferIds: string[],
  ): Promise<Map<string, StockTransferLineEntity[]>> {
    const grouped = new Map<string, StockTransferLineEntity[]>();
    if (transferIds.length === 0) return grouped;

    const lines = await this.repo.manager
      .getRepository(StockTransferLineEntity)
      .find({ where: { transferId: In(transferIds) } });

    for (const line of lines) {
      const bucket = grouped.get(line.transferId) ?? [];
      bucket.push(line);
      grouped.set(line.transferId, bucket);
    }
    return grouped;
  }
}
