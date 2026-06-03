import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { JobPositionEntity } from '../../hr/job-position/job-position.entity';
import { SearchJobPositionsV2Query } from './search-job-positions-v2.query';

@QueryHandler(SearchJobPositionsV2Query)
export class SearchJobPositionsV2Handler
  implements IQueryHandler<SearchJobPositionsV2Query>
{
  constructor(
    @InjectRepository(JobPositionEntity)
    private readonly repo: Repository<JobPositionEntity>,
  ) {}

  async execute({ dto, actor }: SearchJobPositionsV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Soft-deleted rows are excluded automatically — the entity carries a
    // @DeleteDateColumn, so the query builder adds `deleted_at IS NULL`.
    const qb = this.repo
      .createQueryBuilder('jp')
      .where('jp.organizationId = :orgId', { orgId: actor.organizationId });

    new FilterBuilder(qb)
      .applyString('jp.name', dto.name)
      .applyString('jp.code', dto.code)
      .applyDateRange('jp.createdAt', dto.createdAt);

    if (dto.isActive !== undefined) {
      qb.andWhere('jp.isActive = :isActive', { isActive: dto.isActive });
    }

    qb.orderBy('jp.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
