import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { AccountEntity } from '../../accounting/coa/account.entity';
import { SearchAccountsV2Query } from './search-accounts-v2.query';

@QueryHandler(SearchAccountsV2Query)
export class SearchAccountsV2Handler
  implements IQueryHandler<SearchAccountsV2Query>
{
  constructor(
    @InjectRepository(AccountEntity)
    private readonly repo: Repository<AccountEntity>,
  ) {}

  async execute({ dto, actor }: SearchAccountsV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // No parent-account join: the row returns the raw `parentAccountId` UUID,
    // matching the current generic CRUD list (parent name is resolved on the FE).
    const qb = this.repo
      .createQueryBuilder('acc')
      .where('acc.organizationId = :orgId', { orgId: actor.organizationId });

    new FilterBuilder(qb)
      .applyString('acc.code', dto.code)
      .applyString('acc.name', dto.name)
      .applyEnum('acc.type', dto.type?.value)
      .applyDateRange('acc.createdAt', dto.createdAt);

    if (dto.isActive !== undefined) {
      qb.andWhere('acc.isActive = :isActive', { isActive: dto.isActive });
    }
    if (dto.parentAccountId) {
      qb.andWhere('acc.parentAccountId = :parentAccountId', {
        parentAccountId: dto.parentAccountId,
      });
    }

    qb.orderBy('acc.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
