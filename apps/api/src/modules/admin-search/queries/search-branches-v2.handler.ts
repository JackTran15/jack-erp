import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { BranchEntity } from '../../branch/branch.entity';
import { SearchBranchesV2Query } from './search-branches-v2.query';

@QueryHandler(SearchBranchesV2Query)
export class SearchBranchesV2Handler
  implements IQueryHandler<SearchBranchesV2Query>
{
  constructor(
    @InjectRepository(BranchEntity)
    private readonly repo: Repository<BranchEntity>,
  ) {}

  async execute({ dto, actor }: SearchBranchesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const qb = this.repo
      .createQueryBuilder('branch')
      .where('branch.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('branch.name', dto.name)
      .applyString('branch.address', dto.address)
      .applyEnum('branch.status', dto.status?.value);

    qb.orderBy('branch.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
