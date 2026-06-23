import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleSummary } from '@erp/shared-interfaces';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { RoleEntity } from '../../auth/role.entity';
import { SearchRolesV2Query } from './search-roles-v2.query';

@QueryHandler(SearchRolesV2Query)
export class SearchRolesV2Handler
  implements IQueryHandler<SearchRolesV2Query>
{
  constructor(
    @InjectRepository(RoleEntity)
    private readonly repo: Repository<RoleEntity>,
  ) {}

  async execute({ dto, actor }: SearchRolesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const qb = this.repo
      .createQueryBuilder('role')
      .where('role.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    new FilterBuilder(qb)
      .applyString('role.name', dto.name)
      .applyString('role.description', dto.description);

    qb.orderBy('role.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const data: RoleSummary[] = rows.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    }));

    return { data, total, page, limit };
  }
}
