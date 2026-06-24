import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IDropdownOption,
  REPORT_ENUM_OPTION_TABLES,
  ReportFilterOptionType,
} from '@erp/shared-interfaces';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { UserEntity } from '../../../auth/user.entity';
import { BranchEntity } from '../../../branch/branch.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { EmployeeProfileEntity } from '../../../rbac/employee/employee-profile.entity';
import { ReportFilterOptionsQueryDto } from '../dto/report-filter-options-query.dto';
import { GetReportFilterOptionsQuery } from './get-report-filter-options.query';

/** "Last First" — mirrors the per-line report name resolution. */
const fullName = (u?: { firstName?: string; lastName?: string }): string | null => {
  if (!u) return null;
  const name = [u.lastName, u.firstName].filter(Boolean).join(' ').trim();
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
  ) {}

  async execute({
    dto,
    actor,
  }: GetReportFilterOptionsQuery): Promise<IDropdownOption[]> {
    const org = actor.organizationId;
    switch (dto.type) {
      case ReportFilterOptionType.STORE:
        return this.stores(org, dto);
      case ReportFilterOptionType.CASHIER:
        return this.cashiers(org, dto);
      case ReportFilterOptionType.SALESPERSON:
        return this.salespeople(org, dto);
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

  /** Cashier — invoice.staffId references users.id. value = user id. */
  private async cashiers(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const base: FindOptionsWhere<UserEntity> = {
      organizationId: org,
      isActive: true,
    };
    const where = dto.search
      ? [
          { ...base, firstName: ILike(`%${dto.search}%`) },
          { ...base, lastName: ILike(`%${dto.search}%`) },
        ]
      : base;
    const rows = await this.users.find({
      where,
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((u) => ({ value: u.id, label: fullName(u) ?? u.email }));
  }

  /** Salesperson — invoice.salespersonId references employee_profiles.id; name via users. */
  private async salespeople(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const qb = this.employees
      .createQueryBuilder('e')
      .innerJoin(UserEntity, 'u', 'u.id = e.userId AND u.organizationId = e.organizationId')
      .where('e.organizationId = :org', { org })
      .select('e.id', 'id')
      .addSelect('e.code', 'code')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName');
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
    return rows.map((r) => ({ value: r.id, label: fullName(r) ?? r.code }));
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
