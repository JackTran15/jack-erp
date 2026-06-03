import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { UserEntity } from '../../auth/user.entity';
import { EmployeeProfileEntity } from '../../rbac/employee/employee-profile.entity';
import { UsersService } from '../../rbac/users.service';
import { SearchEmployeesV2Query } from './search-employees-v2.query';

@QueryHandler(SearchEmployeesV2Query)
export class SearchEmployeesV2Handler
  implements IQueryHandler<SearchEmployeesV2Query>
{
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly users: UsersService,
  ) {}

  async execute({ dto, actor }: SearchEmployeesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // Join the profile only for filtering (code / fullName / job position). The
    // returned row data comes from UsersService.toListItems(), which re-loads the
    // profile with its jobPosition relation — keeping the row shape identical to
    // GET /admin/users.
    const qb = this.userRepo
      .createQueryBuilder('u')
      // `users.organization_id` is uuid but `employee_profiles.organization_id`
      // (via BaseEntity) is varchar, so the join must cast. Use raw snake_case
      // columns: TypeORM does not translate `alias.property` before a `::cast`.
      .leftJoin(
        EmployeeProfileEntity,
        'profile',
        'profile.user_id = u.id AND profile.organization_id::uuid = u.organization_id',
      )
      .where('u.organizationId = :orgId', { orgId: actor.organizationId });

    new FilterBuilder(qb)
      .applyString('profile.code', dto.code)
      // Raw column names (not entity properties) on purpose: TypeORM only
      // translates `alias.property` tokens, which it would not do inside a
      // CONCAT(...) function expression. The table alias is `u`.
      .applyString("CONCAT(u.first_name, ' ', u.last_name)", dto.fullName)
      .applyString('u.email', dto.email)
      .applyDateRange('u.createdAt', dto.createdAt);

    if (dto.isActive !== undefined) {
      qb.andWhere('u.isActive = :isActive', { isActive: dto.isActive });
    }
    if (dto.jobPositionId) {
      qb.andWhere('profile.jobPositionId = :jobPositionId', {
        jobPositionId: dto.jobPositionId,
      });
    }

    qb.orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const data = await this.users.toListItems(rows, actor);
    return { data, total, page, limit };
  }
}
