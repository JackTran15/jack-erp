import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IDropdownOption,
  REPORT_ENUM_OPTION_TABLES,
  ReportFilterOptionType,
} from '@erp/shared-interfaces';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../branch/branch.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { InventoryFilterOptionsQueryDto } from '../dto/inventory-filter-options-query.dto';
import { permittedBranchIds } from '../report/report-scope.util';
import { GetInventoryFilterOptionsQuery } from './get-inventory-filter-options.query';

/** Dropdown options for the inventory report filters (store, warehouse, …). */
@QueryHandler(GetInventoryFilterOptionsQuery)
export class GetInventoryFilterOptionsHandler
  implements IQueryHandler<GetInventoryFilterOptionsQuery>
{
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(StorageEntity)
    private readonly storages: Repository<StorageEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: GetInventoryFilterOptionsQuery): Promise<IDropdownOption[]> {
    const org = actor.organizationId;
    switch (dto.type) {
      case ReportFilterOptionType.STORE:
        return this.stores(org, dto, actor);
      case ReportFilterOptionType.WAREHOUSE:
        return this.warehouses(org, dto, actor);
      case ReportFilterOptionType.PRODUCT_GROUP:
        return this.productGroups(org, dto);
      case ReportFilterOptionType.BRAND:
        return this.distinctItemField(org, dto, 'brand');
      case ReportFilterOptionType.UNIT:
        return this.distinctItemField(org, dto, 'unit');
      case ReportFilterOptionType.PRODUCT_TYPE:
      case ReportFilterOptionType.STAT_BY:
        return this.enumOptions(dto);
      default:
        throw new BadRequestException(`Unknown filter option type: ${dto.type}`);
    }
  }

  private take(dto: InventoryFilterOptionsQueryDto): number {
    return dto.pageSize ?? 20;
  }

  private skip(dto: InventoryFilterOptionsQueryDto): number {
    return ((dto.page ?? 1) - 1) * this.take(dto);
  }

  /** Stores — only the branches the actor manages; value = branch id. */
  private async stores(
    org: string,
    dto: InventoryFilterOptionsQueryDto,
    actor: ActorContext,
  ): Promise<IDropdownOption[]> {
    const permitted = permittedBranchIds(actor);
    if (!permitted.size) return [];
    const where: FindOptionsWhere<BranchEntity> = {
      organizationId: org,
      id: In([...permitted]),
    };
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
   * Warehouses — storages of the requested branches ∩ the branches the actor
   * manages (no branchIds requested ⇒ every permitted branch); value = storage id.
   */
  private async warehouses(
    org: string,
    dto: InventoryFilterOptionsQueryDto,
    actor: ActorContext,
  ): Promise<IDropdownOption[]> {
    const permitted = permittedBranchIds(actor);
    const effective = dto.branchIds?.length
      ? dto.branchIds.filter((id) => permitted.has(id))
      : [...permitted];
    if (!effective.length) return [];
    const where: FindOptionsWhere<StorageEntity> = {
      organizationId: org,
      branchId: In(effective),
    };
    if (dto.search) where.name = ILike(`%${dto.search}%`);
    const rows = await this.storages.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((s) => ({
      value: s.id,
      label: s.name,
      metadata: { branchId: s.branchId, code: s.code ?? null },
    }));
  }

  /** Product groups — item categories. */
  private async productGroups(
    org: string,
    dto: InventoryFilterOptionsQueryDto,
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
    dto: InventoryFilterOptionsQueryDto,
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

  /** Static enum tables (productType / statBy). */
  private enumOptions(dto: InventoryFilterOptionsQueryDto): IDropdownOption[] {
    const table = REPORT_ENUM_OPTION_TABLES[dto.type];
    if (!table) {
      throw new BadRequestException(`No enum options for type: ${dto.type}`);
    }
    return table.map((o) => ({ value: o.value, label: o.label }));
  }
}
