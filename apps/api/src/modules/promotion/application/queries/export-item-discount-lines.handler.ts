import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PromotionTargetType } from '@erp/shared-interfaces';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ProductEntity } from '../../../inventory/product/product.entity';
import {
  buildItemDiscountWorkbook,
  ItemDiscountWorkbookLine,
} from '../../infrastructure/excel/item-discount-workbook';
import { ExportItemDiscountLinesQuery } from './export-item-discount-lines.query';

/**
 * Dựng file Excel từ các dòng đang có trên lưới (A-15). Mã/tên đọc lại từ DB theo tổ chức;
 * dòng có `targetId` không thuộc tổ chức bị bỏ qua (AC-12). Dữ liệu vào sheet của `method`,
 * kể cả `FIXED_PRICE` (sheet Đồng giá, không có cột giá trị).
 */
@QueryHandler(ExportItemDiscountLinesQuery)
export class ExportItemDiscountLinesHandler implements IQueryHandler<ExportItemDiscountLinesQuery> {
  constructor(
    @InjectRepository(ItemEntity) private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
  ) {}

  async execute({ dto, actor }: ExportItemDiscountLinesQuery): Promise<Buffer> {
    const itemIds = dto.lines.filter((l) => l.targetType === PromotionTargetType.ITEM).map((l) => l.targetId);
    const productIds = dto.lines.filter((l) => l.targetType === PromotionTargetType.PRODUCT).map((l) => l.targetId);

    const [items, products] = await Promise.all([
      itemIds.length ? this.itemRepo.find({ where: { id: In(itemIds), organizationId: actor.organizationId } }) : [],
      productIds.length
        ? this.productRepo.find({ where: { id: In(productIds), organizationId: actor.organizationId } })
        : [],
    ]);

    const itemById = new Map(items.map((i) => [i.id, i]));
    const productById = new Map(products.map((p) => [p.id, p]));

    const lines: ItemDiscountWorkbookLine[] = [];
    for (const line of dto.lines) {
      if (line.targetType === PromotionTargetType.ITEM) {
        const item = itemById.get(line.targetId);
        if (!item) continue;
        lines.push({ code: item.code, name: item.name, value: line.value });
      } else {
        const product = productById.get(line.targetId);
        if (!product) continue;
        // `products.code` is nullable; a product without a code exports an empty SKU cell.
        lines.push({ code: product.code ?? '', name: product.name, value: line.value });
      }
    }

    return buildItemDiscountWorkbook(dto.method, lines);
  }
}
