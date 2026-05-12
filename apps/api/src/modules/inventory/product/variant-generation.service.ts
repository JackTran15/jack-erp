import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { randomBytes } from 'crypto';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ProductEntity } from './product.entity';
import { ProductAttributeDefinitionEntity } from './product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from './product-attribute-option.entity';
import { ItemAttributeValueEntity } from './item-attribute-value.entity';
import { ItemEntity } from '../location/item.entity';
import { ItemProviderEntity } from '../location/item-provider.entity';

const VARIANT_THRESHOLD = 500;
const MAX_CODE_COLLISION_RETRIES = 5;

interface OptionCombo {
  definition: ProductAttributeDefinitionEntity;
  option: ProductAttributeOptionEntity;
}

@Injectable()
export class VariantGenerationService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(ProductAttributeDefinitionEntity)
    private readonly defRepo: Repository<ProductAttributeDefinitionEntity>,
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ItemAttributeValueEntity)
    private readonly junctionRepo: Repository<ItemAttributeValueEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async generateVariants(
    productId: string,
    actor: ActorContext,
    force = false,
  ): Promise<{ createdCount: number; items: ItemEntity[] }> {
    const product = await this.resolveProduct(productId, actor);
    this.ensureHasProvider(product);

    const definitions = await this.loadDefinitionsWithOptions(productId, actor);
    if (definitions.length === 0) {
      throw new BadRequestException(
        'Sản phẩm chưa có thuộc tính nào. Hãy thêm thuộc tính trước khi tạo biến thể.',
      );
    }

    const optionArrays = definitions.map((d) => {
      if (!d.options || d.options.length === 0) {
        throw new BadRequestException(
          `Thuộc tính "${d.name}" chưa có giá trị nào. Hãy thêm giá trị trước khi tạo biến thể.`,
        );
      }
      return d.options;
    });

    const combos = cartesianProduct(optionArrays);

    if (combos.length > VARIANT_THRESHOLD && !force) {
      throw new BadRequestException(
        `Tổ hợp biến thể (${combos.length}) vượt quá ngưỡng ${VARIANT_THRESHOLD}. ` +
          'Gửi lại với force=true nếu muốn tiếp tục.',
      );
    }

    const createdItems: ItemEntity[] = [];

    await this.dataSource.transaction(async (manager) => {
      for (const combo of combos) {
        const optionComboPairs: OptionCombo[] = combo.map((opt, idx) => ({
          definition: definitions[idx],
          option: opt,
        }));

        const existing = await this.findExistingVariant(
          manager,
          productId,
          actor.organizationId,
          optionComboPairs,
        );
        if (existing) continue;

        const item = await this.createVariantItem(
          manager,
          product,
          optionComboPairs,
          actor,
        );
        createdItems.push(item);
      }
    });

    return { createdCount: createdItems.length, items: createdItems };
  }

  async resolveOrCreateVariant(
    productId: string,
    attributeCombo: Record<string, string>,
    actor: ActorContext,
  ): Promise<ItemEntity> {
    const product = await this.resolveProduct(productId, actor);
    this.ensureHasProvider(product);

    const definitions = await this.loadDefinitionsWithOptions(productId, actor);
    const optionComboPairs = this.resolveComboFromLabels(
      definitions,
      attributeCombo,
    );

    const existing = await this.findExistingVariant(
      this.junctionRepo.manager,
      productId,
      actor.organizationId,
      optionComboPairs,
    );
    if (existing) return existing;

    return this.dataSource.transaction(async (manager) => {
      return this.createVariantItem(manager, product, optionComboPairs, actor);
    });
  }

  private async resolveProduct(
    productId: string,
    actor: ActorContext,
  ): Promise<ProductEntity> {
    const product = await this.productRepo.findOne({
      where: { id: productId, organizationId: actor.organizationId },
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm ${productId}`);
    }
    return product;
  }

  private ensureHasProvider(product: ProductEntity): void {
    if (!product.defaultProviderId) {
      throw new BadRequestException(
        'Sản phẩm chưa có nhà cung cấp mặc định. Hãy cập nhật defaultProviderId trước khi tạo biến thể.',
      );
    }
  }

  private async loadDefinitionsWithOptions(
    productId: string,
    actor: ActorContext,
  ): Promise<ProductAttributeDefinitionEntity[]> {
    return this.defRepo.find({
      where: { productId, organizationId: actor.organizationId },
      relations: ['options'],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  private resolveComboFromLabels(
    definitions: ProductAttributeDefinitionEntity[],
    attributeCombo: Record<string, string>,
  ): OptionCombo[] {
    const pairs: OptionCombo[] = [];

    for (const [defName, optionLabel] of Object.entries(attributeCombo)) {
      const def = definitions.find((d) => d.name === defName);
      if (!def) {
        throw new BadRequestException(
          `Thuộc tính "${defName}" không tồn tại cho sản phẩm này.`,
        );
      }
      const option = def.options?.find((o) => o.valueLabel === optionLabel);
      if (!option) {
        throw new BadRequestException(
          `Giá trị "${optionLabel}" không tồn tại trong thuộc tính "${defName}".`,
        );
      }
      pairs.push({ definition: def, option });
    }

    pairs.sort((a, b) => a.definition.sortOrder - b.definition.sortOrder);
    return pairs;
  }

  private async findExistingVariant(
    manager: EntityManager,
    productId: string,
    organizationId: string,
    combo: OptionCombo[],
  ): Promise<ItemEntity | null> {
    if (combo.length === 0) return null;

    const optionIds = combo.map((c) => c.option.id);

    // Find items for this product that have exactly this set of attribute values.
    // An item matches if it has junction rows for ALL option IDs in the combo
    // AND the total number of its junction rows equals the combo length
    // (so it doesn't have extra attributes).
    const qb = manager
      .createQueryBuilder(ItemEntity, 'item')
      .where('item.product_id = :productId', { productId })
      .andWhere('item.organization_id = :organizationId', { organizationId })
      .andWhere((subQb) => {
        const matchCount = subQb
          .subQuery()
          .select('COUNT(DISTINCT iav.option_id)')
          .from(ItemAttributeValueEntity, 'iav')
          .where('iav.item_id = item.id')
          .andWhere('iav.option_id IN (:...optionIds)')
          .getQuery();
        return `${matchCount} = :comboLen`;
      })
      .andWhere((subQb) => {
        const totalCount = subQb
          .subQuery()
          .select('COUNT(*)')
          .from(ItemAttributeValueEntity, 'iav2')
          .where('iav2.item_id = item.id')
          .getQuery();
        return `${totalCount} = :comboLen`;
      })
      .setParameter('optionIds', optionIds)
      .setParameter('comboLen', combo.length);

    return qb.getOne();
  }

  private async createVariantItem(
    manager: EntityManager,
    product: ProductEntity,
    combo: OptionCombo[],
    actor: ActorContext,
  ): Promise<ItemEntity> {
    const variantLabel = combo
      .map((c) => c.option.valueLabel)
      .join(' · ');
    const itemName = `${product.name} (${variantLabel})`;
    const code = await this.generateUniqueCode(
      manager,
      product,
      combo,
      actor.organizationId,
    );

    const item = manager.create(ItemEntity, {
      code,
      name: itemName,
      unit: 'pcs',
      isActive: true,
      purchasePrice: 0,
      sellingPrice: 0,
      productId: product.id,
      variantLabel,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });

    const savedItem = await manager.save(ItemEntity, item);

    // Link default provider as primary in M2M table.
    await manager.save(
      ItemProviderEntity,
      manager.create(ItemProviderEntity, {
        itemId: savedItem.id,
        providerId: product.defaultProviderId!,
        isPrimary: true,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );

    const junctions = combo.map((c) =>
      manager.create(ItemAttributeValueEntity, {
        itemId: savedItem.id,
        attributeDefinitionId: c.definition.id,
        optionId: c.option.id,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
    await manager.save(ItemAttributeValueEntity, junctions);

    return savedItem;
  }

  private async generateUniqueCode(
    manager: EntityManager,
    product: ProductEntity,
    combo: OptionCombo[],
    organizationId: string,
  ): Promise<string> {
    const prefix = slugPrefix(product.name);
    const suffix = combo
      .map((c) => c.option.codeSuffix || slugPrefix(c.option.valueLabel))
      .join('-');

    let candidate = `${prefix}-${suffix}`.toUpperCase();

    for (let attempt = 0; attempt < MAX_CODE_COLLISION_RETRIES; attempt++) {
      const exists = await manager.findOne(ItemEntity, {
        where: { organizationId, code: candidate },
      });
      if (!exists) return candidate;
      candidate = `${prefix}-${suffix}-${shortRandom()}`.toUpperCase();
    }

    return `${prefix}-${suffix}-${shortRandom()}${shortRandom()}`.toUpperCase();
  }
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  return arrays.reduce<T[][]>(
    (acc, curr) => acc.flatMap((combo) => curr.map((item) => [...combo, item])),
    [[]],
  );
}

function slugPrefix(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'VAR';
}

function shortRandom(): string {
  return randomBytes(2).toString('hex');
}
