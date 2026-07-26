import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PromotionProgramDetail, PromotionTargetType } from '@erp/shared-interfaces';
import { PROMOTION_REPOSITORY, PromotionRepositoryPort } from '../../domain/ports/promotion-repository.port';
import { PromotionLine } from '../../domain/model/promotion-line';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ProductEntity } from '../../../inventory/product/product.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { ResolvedTarget, toDetail } from '../dto/promotion-program.response.dto';
import { GetPromotionQuery } from './get-promotion.query';

@QueryHandler(GetPromotionQuery)
export class GetPromotionHandler implements IQueryHandler<GetPromotionQuery> {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotionRepo: PromotionRepositoryPort,
    @InjectRepository(ItemEntity) private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(ItemCategoryEntity) private readonly categoryRepo: Repository<ItemCategoryEntity>,
  ) {}

  async execute({ id, actor }: GetPromotionQuery): Promise<PromotionProgramDetail> {
    const program = await this.promotionRepo.findById(actor.organizationId, id);
    if (!program) {
      throw new NotFoundException(`Promotion program "${id}" not found`);
    }

    const allLines = program.groups.flatMap((group) => group.lines);
    const itemIds = allLines.filter((l) => l.targetType === PromotionTargetType.ITEM).map((l) => l.targetId);
    const productIds = allLines.filter((l) => l.targetType === PromotionTargetType.PRODUCT).map((l) => l.targetId);
    const categoryIds = allLines.filter((l) => l.targetType === PromotionTargetType.CATEGORY).map((l) => l.targetId);

    const [items, products, categories] = await Promise.all([
      itemIds.length ? this.itemRepo.find({ where: { id: In(itemIds), organizationId: actor.organizationId } }) : [],
      productIds.length
        ? this.productRepo.find({ where: { id: In(productIds), organizationId: actor.organizationId } })
        : [],
      categoryIds.length
        ? this.categoryRepo.find({ where: { id: In(categoryIds), organizationId: actor.organizationId } })
        : [],
    ]);

    const itemById = new Map(items.map((i) => [i.id, i]));
    const productById = new Map(products.map((p) => [p.id, p]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const resolveTarget = (line: PromotionLine): ResolvedTarget => {
      if (line.targetType === PromotionTargetType.ITEM) {
        const item = itemById.get(line.targetId);
        return item
          ? { targetCode: item.code, targetName: item.name, unit: item.unit, sellingPrice: Number(item.sellingPrice) }
          : {};
      }
      if (line.targetType === PromotionTargetType.PRODUCT) {
        const product = productById.get(line.targetId);
        return product ? { targetCode: product.code, targetName: product.name } : {};
      }
      // CATEGORY
      const category = categoryById.get(line.targetId);
      return category ? { targetCode: category.code, targetName: category.name } : {};
    };

    return toDetail(program, resolveTarget);
  }
}
