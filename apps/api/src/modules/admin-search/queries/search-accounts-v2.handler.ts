import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
    return { data: await this.withParentNames(data, actor.organizationId), total, page, limit };
  }

  /**
   * Inline the parent account's label so the admin grid shows a name instead of
   * a raw UUID. Mirrors `CoaService.list` — this endpoint, not the generic CRUD
   * one, is what the "Tài khoản kế toán" grid actually reads. One batched
   * lookup per page, never per row.
   */
  private async withParentNames(
    rows: AccountEntity[],
    organizationId: string,
  ): Promise<AccountEntity[]> {
    const parentIds = [
      ...new Set(
        rows.map((r) => r.parentAccountId).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (parentIds.length === 0) return rows;

    const parents = await this.repo.find({
      where: { id: In(parentIds), organizationId },
    });
    const parentById = new Map(parents.map((p) => [p.id, p]));

    return rows.map((row) => {
      const parent = row.parentAccountId ? parentById.get(row.parentAccountId) : undefined;
      return {
        ...row,
        parentAccountName: parent ? `${parent.code} - ${parent.name}` : '—',
      };
    }) as AccountEntity[];
  }
}
