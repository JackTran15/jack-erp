import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { IDropdownOption, ReportFilterOptionType } from '@erp/shared-interfaces';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { BranchEntity } from '../../../branch/branch.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { ReportFilterOptionsQueryDto } from '../dto/report-filter-options-query.dto';
import { GetReportFilterOptionsQuery } from './get-report-filter-options.query';

@QueryHandler(GetReportFilterOptionsQuery)
export class GetReportFilterOptionsHandler
  implements IQueryHandler<GetReportFilterOptionsQuery>
{
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: GetReportFilterOptionsQuery): Promise<IDropdownOption[]> {
    const org = actor.organizationId;
    switch (dto.type) {
      case ReportFilterOptionType.STORE:
        return this.stores(org, dto);
      case ReportFilterOptionType.PRODUCT_GROUP:
        return this.productGroups(org, dto);
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

  /** Product groups — item categories ("Nhóm hàng hóa"). */
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
}
