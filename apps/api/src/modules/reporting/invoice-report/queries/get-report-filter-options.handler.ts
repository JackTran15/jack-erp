import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IDropdownOption,
  REPORT_ENUM_OPTION_TABLES,
  ReportFilterOptionType,
} from '@erp/shared-interfaces';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { UserEntity } from '../../../auth/user.entity';
import { BranchEntity } from '../../../branch/branch.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { EmployeeProfileEntity } from '../../../rbac/employee/employee-profile.entity';
import {
  EmployeeBranchScopeService,
  EmployeeScope,
  employeeBranchScopeSqlNamed,
} from '../../../rbac/employee-branch-scope.service';
import { ReportFilterOptionsQueryDto } from '../dto/report-filter-options-query.dto';
import { GetReportFilterOptionsQuery } from './get-report-filter-options.query';

/** "First Last" — matches the codebase-wide name convention (see counterparty-name.util.ts). */
const fullName = (u?: { firstName?: string; lastName?: string }): string | null => {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return name || null;
};

@QueryHandler(GetReportFilterOptionsQuery)
export class GetReportFilterOptionsHandler
  implements IQueryHandler<GetReportFilterOptionsQuery>
{
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly employees: Repository<EmployeeProfileEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
    private readonly employeeScope: EmployeeBranchScopeService,
  ) {}

  async execute({
    dto,
    actor,
  }: GetReportFilterOptionsQuery): Promise<IDropdownOption[]> {
    const org = actor.organizationId;
    switch (dto.type) {
      case ReportFilterOptionType.STORE:
        return this.stores(org, dto);
      // The scope is resolved inside these two branches only: every other
      // filter type would otherwise pay for a permission lookup it never reads.
      case ReportFilterOptionType.CASHIER:
        return this.cashiers(
          org,
          dto,
          this.narrowScope(await this.employeeScope.resolve(actor), dto, actor),
        );
      case ReportFilterOptionType.SALESPERSON:
        return this.salespeople(
          org,
          dto,
          this.narrowScope(await this.employeeScope.resolve(actor), dto, actor),
        );
      case ReportFilterOptionType.CUSTOMER:
        return this.customersOptions(org, dto);
      case ReportFilterOptionType.PRODUCT_GROUP:
        return this.productGroups(org, dto);
      case ReportFilterOptionType.BRAND:
        return this.distinctItemField(org, dto, 'brand');
      case ReportFilterOptionType.UNIT:
        return this.distinctItemField(org, dto, 'unit');
      case ReportFilterOptionType.INVOICE_STATUS:
      case ReportFilterOptionType.STAT_DATE_TYPE:
      case ReportFilterOptionType.PRODUCT_TYPE:
      case ReportFilterOptionType.STAT_BY:
        return this.enumOptions(dto);
      default:
        throw new BadRequestException(`Unknown filter option type: ${dto.type}`);
    }
  }

  /**
   * A branch named by the caller wins over the permission-derived scope.
   *
   * POS sends its active branch, so a store manager holding `iam.user.read.all`
   * gets that store's people rather than the whole chain's. The backoffice chain
   * reports send nothing and keep `EmployeeBranchScopeService`'s answer, which is
   * what makes a consolidated cashier filter possible at all — narrowing the
   * shared service instead would have emptied that screen.
   *
   * The membership check is the whole security of the parameter: without it this
   * is a way for any actor to read the staff of a branch they do not belong to.
   *
   * The bound is `branchIds` — the assignment list — not the active branch, so
   * this is not purely a narrowing: an actor assigned to A and B, working in A,
   * can name B here without going through `/auth/switch-branch`. Deliberate, and
   * consistent with `/admin/users`, which already spans every assigned branch.
   */
  private narrowScope(
    scope: EmployeeScope,
    dto: ReportFilterOptionsQueryDto,
    actor: ActorContext,
  ): EmployeeScope {
    if (!dto.branchId) return scope;
    if (!actor.branchIds?.includes(dto.branchId)) {
      throw new ForbiddenException(`Access denied for branch: ${dto.branchId}`);
    }
    return { mode: 'branch', branchId: dto.branchId };
  }

  private take(dto: ReportFilterOptionsQueryDto): number {
    return dto.pageSize ?? 20;
  }

  private skip(dto: ReportFilterOptionsQueryDto): number {
    return ((dto.page ?? 1) - 1) * this.take(dto);
  }

  /** Stores — value = branch id (matches store scope), metadata.branchId. */
  private async stores(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const where: FindOptionsWhere<BranchEntity> = { organizationId: org };
    if (dto.search) where.name = ILike(`%${dto.search}%`);
    const rows = await this.branches.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((b) => ({
      value: b.id,
      label: b.name,
      metadata: { branchId: b.id },
    }));
  }

  /**
   * Cashier — invoice.staffId references users.id. value = user id. Label is
   * "{employee code} - {name}" when the user has a linked employee_profiles
   * row (1:1 via user_id); falls back to the bare name/email otherwise.
   */
  private async cashiers(
    org: string,
    dto: ReportFilterOptionsQueryDto,
    scope: EmployeeScope,
  ): Promise<IDropdownOption[]> {
    if (scope.mode === 'none') return [];

    // A QueryBuilder rather than find(): FindOptionsWhere cannot carry the raw
    // EXISTS predicate. Every other clause is a literal transcription of the
    // find() it replaces — the OR over first/last name, the ordering, the
    // paging — because a changed label is harder to spot than a changed filter.
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.organizationId = :org', { org })
      .andWhere('u.isActive = true');
    if (scope.mode === 'branch')
      qb.andWhere(employeeBranchScopeSqlNamed('u.id'), {
        scopeBranchId: scope.branchId,
      });
    if (dto.search)
      qb.andWhere('(u.firstName ILIKE :s OR u.lastName ILIKE :s)', {
        s: `%${dto.search}%`,
      });
    const rows = await qb
      .orderBy('u.lastName', 'ASC')
      .addOrderBy('u.firstName', 'ASC')
      .skip(this.skip(dto))
      .take(this.take(dto))
      .getMany();
    const userIds = rows.map((u) => u.id);
    const profiles = userIds.length
      ? await this.employees.find({ where: { userId: In(userIds) } })
      : [];
    const codeByUserId = new Map(profiles.map((p) => [p.userId, p.code]));
    return rows.map((u) => {
      const name = fullName(u) ?? u.email;
      const code = codeByUserId.get(u.id);
      return {
        value: u.id,
        label: code ? `${code} - ${name}` : name,
        metadata: { name },
      };
    });
  }

  /**
   * Salesperson — invoice.salespersonId references employee_profiles.id; name
   * via users. Label is "{employee code} - {name}"; falls back to the bare
   * code when the linked user has no name on file.
   */
  private async salespeople(
    org: string,
    dto: ReportFilterOptionsQueryDto,
    scope: EmployeeScope,
  ): Promise<IDropdownOption[]> {
    if (scope.mode === 'none') return [];

    const qb = this.employees
      .createQueryBuilder('e')
      .innerJoin(UserEntity, 'u', 'u.id = e.userId AND e.organization_id::uuid = u.organizationId')
      .where('e.organizationId = :org', { org })
      .select('e.id', 'id')
      .addSelect('e.code', 'code')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName');
    // Keyed on u.id, not e.id: user_branch_assignments.user_id points at
    // users.id. Keying on the profile id would make the predicate match nothing
    // and read on screen as "no salespeople", not as a bug.
    if (scope.mode === 'branch')
      qb.andWhere(employeeBranchScopeSqlNamed('u.id'), {
        scopeBranchId: scope.branchId,
      });
    if (dto.search) {
      qb.andWhere(
        '(u.firstName ILIKE :s OR u.lastName ILIKE :s OR e.code ILIKE :s)',
        { s: `%${dto.search}%` },
      );
    }
    const rows = await qb
      .orderBy('u.lastName', 'ASC')
      .addOrderBy('u.firstName', 'ASC')
      .offset(this.skip(dto))
      .limit(this.take(dto))
      .getRawMany<{ id: string; code: string; firstName: string; lastName: string }>();
    return rows.map((r) => {
      const name = fullName(r);
      return {
        value: r.id,
        label: name ? `${r.code} - ${name}` : r.code,
        metadata: { name: name ?? r.code },
      };
    });
  }

  /** Customers — search by name or phone. */
  private async customersOptions(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const base: FindOptionsWhere<CustomerEntity> = { organizationId: org };
    const where = dto.search
      ? [
          { ...base, name: ILike(`%${dto.search}%`) },
          { ...base, phone: ILike(`%${dto.search}%`) },
        ]
      : base;
    const rows = await this.customers.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((c) => ({
      value: c.id,
      label: c.name,
      metadata: c.phone ? { phone: c.phone } : undefined,
    }));
  }

  /** Product groups — item categories. */
  private async productGroups(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const where: FindOptionsWhere<ItemCategoryEntity> = { organizationId: org };
    if (dto.search) where.name = ILike(`%${dto.search}%`);
    const rows = await this.categories.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((c) => ({ value: c.id, label: c.name }));
  }

  /** Distinct denormalized item field (brand / unit). */
  private async distinctItemField(
    org: string,
    dto: ReportFilterOptionsQueryDto,
    field: 'brand' | 'unit',
  ): Promise<IDropdownOption[]> {
    const qb = this.items
      .createQueryBuilder('item')
      .select(`DISTINCT item.${field}`, 'value')
      .where('item.organizationId = :org', { org })
      .andWhere(`item.${field} IS NOT NULL`)
      .andWhere(`item.${field} <> ''`);
    if (dto.search) {
      qb.andWhere(`item.${field} ILIKE :s`, { s: `%${dto.search}%` });
    }
    const rows = await qb
      .orderBy('value', 'ASC')
      .offset(this.skip(dto))
      .limit(this.take(dto))
      .getRawMany<{ value: string }>();
    return rows.map((r) => ({ value: r.value, label: r.value }));
  }

  /** Static enum tables (invoiceStatus / statDateType / productType / statBy). */
  private enumOptions(dto: ReportFilterOptionsQueryDto): IDropdownOption[] {
    const table = REPORT_ENUM_OPTION_TABLES[dto.type];
    if (!table) {
      throw new BadRequestException(`No enum options for type: ${dto.type}`);
    }
    return table.map((o) => ({ value: o.value, label: o.label }));
  }
}
