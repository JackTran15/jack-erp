import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { StockTakeEntity } from '../stock-take.entity';
import { SearchStockTakesV2Query } from './search-stock-takes-v2.query';

@QueryHandler(SearchStockTakesV2Query)
export class SearchStockTakesV2Handler
  implements IQueryHandler<SearchStockTakesV2Query>
{
  constructor(
    @InjectRepository(StockTakeEntity)
    private readonly repo: Repository<StockTakeEntity>,
  ) {}

  async execute({ dto, actor }: SearchStockTakesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Org-scoped — mirrors StockTakeService.list() (no branchId filter on the
    // current list). `lines` are eager on the entity; join them explicitly so
    // the row shape matches the find()-based list the detail panel relies on.
    // `storages` is joined (org-scoped ON clause) only to filter by Kho name.
    const qb = this.repo
      .createQueryBuilder('st')
      .leftJoinAndSelect('st.lines', 'lines')
      .leftJoin(
        'storages',
        'storage',
        'storage.id = st.storage_id AND storage.organization_id = st.organization_id',
      )
      .where('st.organizationId = :orgId', { orgId: actor.organizationId });

    new FilterBuilder(qb)
      .applyString('st.documentNumber', dto.documentNumber)
      .applyString('storage.name', dto.storage)
      .applyString('st.purpose', dto.purpose)
      .applyEnum('st.status', dto.status?.value)
      .applyDateRange('st.createdAt', dto.date);

    qb.orderBy('st.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }
}
