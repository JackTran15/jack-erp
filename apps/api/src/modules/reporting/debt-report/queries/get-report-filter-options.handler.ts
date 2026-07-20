import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { IDropdownOption, ReportFilterOptionType } from '@erp/shared-interfaces';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { CustomerEntity } from '../../../customer/customer.entity';
import { CustomerGroupEntity } from '../../../customer/customer-group.entity';
import { ProviderEntity } from '../../../inventory/location/provider.entity';
import { SupplierGroupEntity } from '../../../inventory/location/supplier-group.entity';
import { ReportFilterOptionsQueryDto } from '../dto/report-filter-options-query.dto';
import { GetReportFilterOptionsQuery } from './get-report-filter-options.query';

@QueryHandler(GetReportFilterOptionsQuery)
export class GetReportFilterOptionsHandler
  implements IQueryHandler<GetReportFilterOptionsQuery>
{
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(CustomerGroupEntity)
    private readonly customerGroups: Repository<CustomerGroupEntity>,
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    @InjectRepository(SupplierGroupEntity)
    private readonly supplierGroups: Repository<SupplierGroupEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: GetReportFilterOptionsQuery): Promise<IDropdownOption[]> {
    const org = actor.organizationId;
    switch (dto.type) {
      case ReportFilterOptionType.CUSTOMER:
        return this.customerOptions(org, dto);
      case ReportFilterOptionType.CUSTOMER_GROUP:
        return this.customerGroupOptions(org, dto);
      case ReportFilterOptionType.SUPPLIER:
        return this.supplierOptions(org, dto);
      case ReportFilterOptionType.SUPPLIER_GROUP:
        return this.supplierGroupOptions(org, dto);
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

  private async customerOptions(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const base: FindOptionsWhere<CustomerEntity> = { organizationId: org };
    const where = dto.search
      ? [
          { ...base, name: ILike(`%${dto.search}%`) },
          { ...base, phone: ILike(`%${dto.search}%`) },
          { ...base, code: ILike(`%${dto.search}%`) },
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

  private async customerGroupOptions(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const where: FindOptionsWhere<CustomerGroupEntity> = { organizationId: org };
    if (dto.search) where.name = ILike(`%${dto.search}%`);
    const rows = await this.customerGroups.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((g) => ({ value: g.id, label: g.name }));
  }

  private async supplierOptions(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const base: FindOptionsWhere<ProviderEntity> = { organizationId: org };
    const where = dto.search
      ? [
          { ...base, name: ILike(`%${dto.search}%`) },
          { ...base, code: ILike(`%${dto.search}%`) },
        ]
      : base;
    const rows = await this.providers.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((p) => ({ value: p.id, label: p.name }));
  }

  private async supplierGroupOptions(
    org: string,
    dto: ReportFilterOptionsQueryDto,
  ): Promise<IDropdownOption[]> {
    const where: FindOptionsWhere<SupplierGroupEntity> = { organizationId: org };
    if (dto.search) where.name = ILike(`%${dto.search}%`);
    const rows = await this.supplierGroups.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((g) => ({ value: g.id, label: g.name }));
  }
}
