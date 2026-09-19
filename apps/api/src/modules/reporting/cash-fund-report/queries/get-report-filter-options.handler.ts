import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CASH_FUND_KIND_LABELS_VI,
  CASH_FUND_UNCATEGORIZED,
  IDropdownOption,
} from '@erp/shared-interfaces';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { CashVoucherCategoryEntity } from '../../../accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';
import { CashVoucherCategoryDirection } from '../../../accounting/cash-vouchers/enums';
import { UserEntity } from '../../../auth/user.entity';
import { BranchEntity } from '../../../branch/branch.entity';
import { EmployeeProfileEntity } from '../../../rbac/employee/employee-profile.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { CASH_CONSOLIDATED } from '../report-definition';
import { UNCATEGORIZED_EXPENSE_LABEL } from '../reports/expenses-by-category.report';
import {
  CashFundFilterOptionType,
  ReportFilterOptionsQueryDto,
} from '../dto/report-filter-options-query.dto';
import { GetReportFilterOptionsQuery } from './get-report-filter-options.query';

/** "First Last" — matches the codebase-wide name convention (see counterparty-name.util.ts). */
const fullName = (u: { firstName?: string; lastName?: string }): string | null => {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return name || null;
};

/**
 * The staff column of each voucher table, as text: `staff_id` is a uuid on the
 * cash tables while the deposit tables keep the user id in `collected_by` /
 * `paid_by` varchar columns. All four hold `users.id`.
 */
const VOUCHER_STAFF_COLUMNS: ReadonlyArray<[table: string, column: string]> = [
  ['cash_receipts', 'staff_id'],
  ['cash_payments', 'staff_id'],
  ['bank_receipts', 'collected_by'],
  ['bank_payments', 'paid_by'],
];

/**
 * The distinct staff over the four voucher tables within the report scope.
 * `UNION` (not `UNION ALL`) so the join below sees each user once.
 */
export function voucherStaffSql(consolidated: boolean): string {
  const scope = consolidated ? '' : ' AND branch_id = ANY(:branchIds)';
  return VOUCHER_STAFF_COLUMNS.map(
    ([table, column]) =>
      `SELECT ${column}::text AS staff_id FROM ${table}` +
      ` WHERE organization_id = :org AND deleted_at IS NULL AND ${column} IS NOT NULL${scope}`,
  ).join(' UNION ');
}

@QueryHandler(GetReportFilterOptionsQuery)
export class GetReportFilterOptionsHandler
  implements IQueryHandler<GetReportFilterOptionsQuery>
{
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly employees: Repository<EmployeeProfileEntity>,
    @InjectRepository(CashVoucherCategoryEntity)
    private readonly categories: Repository<CashVoucherCategoryEntity>,
    private readonly rbac: RbacService,
  ) {}

  async execute({ dto, actor }: GetReportFilterOptionsQuery): Promise<IDropdownOption[]> {
    switch (dto.type) {
      case CashFundFilterOptionType.STORE:
        return this.stores(dto, actor.organizationId, actor.userId, actor.branchIds ?? []);
      case CashFundFilterOptionType.EMPLOYEE:
        return this.employeesWithVouchers(
          dto,
          actor.organizationId,
          actor.userId,
          actor.branchIds ?? [],
        );
      case CashFundFilterOptionType.PAYMENT_METHOD:
        return (Object.keys(CASH_FUND_KIND_LABELS_VI) as (keyof typeof CASH_FUND_KIND_LABELS_VI)[]).map(
          (kind) => ({ value: kind, label: CASH_FUND_KIND_LABELS_VI[kind] }),
        );
      case CashFundFilterOptionType.EXPENSE_CATEGORY:
        return this.expenseCategories(dto, actor.organizationId);
      default:
        throw new BadRequestException(`Unknown filter option type: ${String(dto.type)}`);
    }
  }

  private take(dto: ReportFilterOptionsQueryDto): number {
    return dto.pageSize ?? 20;
  }

  private skip(dto: ReportFilterOptionsQueryDto): number {
    return ((dto.page ?? 1) - 1) * this.take(dto);
  }

  /**
   * The stores the actor may pick in "Theo nhóm cửa hàng": every branch of the
   * organization for a consolidated reader, otherwise only the assigned ones —
   * the same set `resolveReportBranchIds` would accept, so the picker never
   * offers a store the search would then refuse.
   */
  private async stores(
    dto: ReportFilterOptionsQueryDto,
    org: string,
    userId: string,
    assigned: string[],
  ): Promise<IDropdownOption[]> {
    const hasConsolidated = await this.rbac.hasPermission(userId, org, CASH_CONSOLIDATED);
    if (!hasConsolidated && !assigned.length) return [];
    const where: FindOptionsWhere<BranchEntity> = { organizationId: org };
    if (!hasConsolidated) where.id = In(assigned);
    if (dto.search) where.name = ILike(`%${dto.search}%`);
    const rows = await this.branches.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((b) => ({ value: b.id, label: b.name, metadata: { branchId: b.id } }));
  }

  /**
   * "Nhân viên" — only the employees recorded as staff on at least one voucher
   * the actor may read (every branch when consolidated, else the assigned
   * ones), so the picker is not the whole HR roster. value = user id, which is
   * what the voucher's `staff_id` holds and what `filters.employeeIds` is
   * matched against. Label is "{employee code} - {name}", as in invoice-report.
   */
  private async employeesWithVouchers(
    dto: ReportFilterOptionsQueryDto,
    org: string,
    userId: string,
    assigned: string[],
  ): Promise<IDropdownOption[]> {
    const hasConsolidated = await this.rbac.hasPermission(userId, org, CASH_CONSOLIDATED);
    if (!hasConsolidated && !assigned.length) return [];

    const qb = this.employees
      .createQueryBuilder('e')
      .innerJoin(UserEntity, 'u', 'u.id = e.userId AND e.organization_id::uuid = u.organizationId')
      .innerJoin(`(${voucherStaffSql(hasConsolidated)})`, 's', 's.staff_id = u.id::text')
      .where('e.organizationId = :org', hasConsolidated ? { org } : { org, branchIds: assigned })
      .select('u.id', 'userId')
      .addSelect('e.code', 'code')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName');
    if (dto.search) {
      qb.andWhere('(u.firstName ILIKE :s OR u.lastName ILIKE :s OR e.code ILIKE :s)', {
        s: `%${dto.search}%`,
      });
    }
    const rows = await qb
      .orderBy('u.lastName', 'ASC')
      .addOrderBy('u.firstName', 'ASC')
      .offset(this.skip(dto))
      .limit(this.take(dto))
      .getRawMany<{ userId: string; code: string; firstName?: string; lastName?: string }>();
    return rows.map((r) => {
      const name = fullName(r);
      return {
        value: r.userId,
        label: name ? `${r.code} - ${name}` : r.code,
        metadata: { name: name ?? r.code },
      };
    });
  }

  /**
   * "Mục chi" — the active OUT categories of the organization, in their
   * display order. A synthetic first option (`uncategorized` / "Chi khác")
   * lets the reader pick the lines that carry no category, the same bucket
   * "Chi tiền theo mục chi" reports under that label.
   */
  private async expenseCategories(
    dto: ReportFilterOptionsQueryDto,
    org: string,
  ): Promise<IDropdownOption[]> {
    const where: FindOptionsWhere<CashVoucherCategoryEntity> = {
      organizationId: org,
      direction: CashVoucherCategoryDirection.OUT,
      isActive: true,
    };
    if (dto.search) where.name = ILike(`%${dto.search}%`);
    const rows = await this.categories.find({
      where,
      order: { displayOrder: 'ASC', name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    const options = rows.map((c) => ({ value: c.id, label: c.name }));
    const uncategorized = { value: CASH_FUND_UNCATEGORIZED, label: UNCATEGORIZED_EXPENSE_LABEL };
    const showUncategorized =
      (dto.page ?? 1) === 1 &&
      (!dto.search || uncategorized.label.toLowerCase().includes(dto.search.toLowerCase()));
    return showUncategorized ? [uncategorized, ...options] : options;
  }
}
