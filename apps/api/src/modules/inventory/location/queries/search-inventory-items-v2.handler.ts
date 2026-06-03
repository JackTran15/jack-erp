import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { ItemEntity } from '../item.entity';
import {
  InventoryItemGroupRowDto,
  InventoryItemSearchV2ResponseDto,
} from '../dto/inventory-item-search-v2.dto';
import { SearchInventoryItemsV2Query } from './search-inventory-items-v2.query';

/**
 * Self-contained product-grouped inventory item search (does NOT reuse
 * listProductGroups). Fetches the org's items with their product + barcodes,
 * aggregates per product (orphans = items without a product) in memory, then
 * applies the per-column filters on the computed rows, sorts and paginates.
 *
 * In-memory aggregation (no SQL GROUP BY) per repo convention; barcode column
 * joins every barcode of the group.
 */
@QueryHandler(SearchInventoryItemsV2Query)
export class SearchInventoryItemsV2Handler
  implements IQueryHandler<SearchInventoryItemsV2Query>
{
  constructor(
    @InjectRepository(ItemEntity)
    private readonly repo: Repository<ItemEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchInventoryItemsV2Query): Promise<InventoryItemSearchV2ResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const items = await this.repo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.barcodes', 'barcode')
      .where('item.organizationId = :orgId', { orgId: actor.organizationId })
      .getMany();

    const rows = this.aggregate(items);
    const filtered = rows.filter((row) => this.matches(row, dto));
    filtered.sort((a, b) => a.code.localeCompare(b.code));

    const total = filtered.length;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return { data, total, page, limit };
  }

  /** Group items by product (orphans = no product) and compute one row each. */
  private aggregate(items: ItemEntity[]): InventoryItemGroupRowDto[] {
    const byProduct = new Map<string, ItemEntity[]>();
    const rows: InventoryItemGroupRowDto[] = [];

    for (const item of items) {
      if (item.productId) {
        const bucket = byProduct.get(item.productId) ?? [];
        bucket.push(item);
        byProduct.set(item.productId, bucket);
      } else {
        rows.push(this.orphanRow(item));
      }
    }

    for (const [productId, group] of byProduct) {
      rows.push(this.productRow(productId, group));
    }

    return rows;
  }

  private productRow(
    productId: string,
    group: ItemEntity[],
  ): InventoryItemGroupRowDto {
    const product = group[0]?.product;
    return {
      type: 'product',
      id: productId,
      code: product?.code ?? product?.name ?? group[0]?.code ?? '',
      name: product?.name ?? '',
      barcode: this.joinBarcodes(group),
      unit: this.minString(group.map((i) => i.unit)) ?? '',
      brand: this.minString(group.map((i) => i.brand)),
      purchasePrice: this.avg(group.map((i) => Number(i.purchasePrice))),
      sellingPrice: this.avg(group.map((i) => Number(i.sellingPrice))),
      isPosVisible: group.every((i) => i.isPosVisible),
      isActive: group.every((i) => i.isActive),
      itemCount: group.length,
    };
  }

  private orphanRow(item: ItemEntity): InventoryItemGroupRowDto {
    return {
      type: 'orphan',
      id: item.id,
      code: item.code,
      name: item.name,
      barcode: this.joinBarcodes([item]),
      unit: item.unit,
      brand: item.brand ?? null,
      purchasePrice: Number(item.purchasePrice),
      sellingPrice: Number(item.sellingPrice),
      isPosVisible: item.isPosVisible,
      isActive: item.isActive,
      itemCount: 0,
    };
  }

  /** All barcodes of the group, de-duplicated, sorted, comma-joined ("" if none). */
  private joinBarcodes(group: ItemEntity[]): string {
    const codes = new Set<string>();
    for (const item of group) {
      for (const bc of item.barcodes ?? []) {
        if (bc.code) codes.add(bc.code);
      }
    }
    return Array.from(codes).sort().join(', ');
  }

  private avg(values: number[]): number {
    const nums = values.filter((v) => Number.isFinite(v));
    if (nums.length === 0) return 0;
    return nums.reduce((sum, v) => sum + v, 0) / nums.length;
  }

  /** Lexicographic MIN over non-empty values (Postgres MIN semantics), null if none. */
  private minString(values: (string | null | undefined)[]): string | null {
    const present = values.filter((v): v is string => !!v);
    if (present.length === 0) return null;
    return present.reduce((min, v) => (v < min ? v : min));
  }

  private matches(
    row: InventoryItemGroupRowDto,
    dto: SearchInventoryItemsV2Query['dto'],
  ): boolean {
    return (
      this.matchString(row.code, dto.code) &&
      this.matchString(row.barcode, dto.barcode) &&
      this.matchString(row.name, dto.name) &&
      this.matchString(row.unit, dto.unit) &&
      this.matchString(row.brand ?? '', dto.brand) &&
      this.matchCompare(row.purchasePrice, dto.purchasePrice) &&
      this.matchCompare(row.sellingPrice, dto.sellingPrice) &&
      (dto.isPosVisible === undefined || row.isPosVisible === dto.isPosVisible) &&
      (dto.isActive === undefined || row.isActive === dto.isActive)
    );
  }

  private matchString(value: string, filter?: StringFilterDto): boolean {
    const needle = filter?.value?.trim().toLowerCase();
    if (!needle) return true;
    const hay = value.toLowerCase();
    switch (filter!.operator) {
      case StringOperator.CONTAINS:
        return hay.includes(needle);
      case StringOperator.EQUALS:
        return hay === needle;
      case StringOperator.STARTS_WITH:
        return hay.startsWith(needle);
      case StringOperator.ENDS_WITH:
        return hay.endsWith(needle);
      case StringOperator.NOT_CONTAINS:
        return !hay.includes(needle);
      default:
        return true;
    }
  }

  private matchCompare(value: number, filter?: CompareFilterDto): boolean {
    if (filter === undefined || filter.value === undefined || filter.value === '') {
      return true;
    }
    const target = Number(filter.value);
    if (!Number.isFinite(target)) return true;
    switch (filter.operator) {
      case CompareOperator.EQUALS:
        return value === target;
      case CompareOperator.LT:
        return value < target;
      case CompareOperator.LTE:
        return value <= target;
      case CompareOperator.GT:
        return value > target;
      case CompareOperator.GTE:
        return value >= target;
      default:
        return true;
    }
  }
}
