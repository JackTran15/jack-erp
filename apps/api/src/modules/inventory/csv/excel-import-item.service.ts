import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryLocationService } from '../location/inventory-location.service';
import {
  InventoryItemCrudService,
} from '../location/item-crud.service';
import { ItemEntity } from '../location/item.entity';
import { ItemBarcodeEntity } from '../location/item-barcode.entity';
import { ItemUnitEntity } from '../location/item-unit.entity';
import { ProductEntity } from '../product/product.entity';
import { ProductAttributeDefinitionEntity } from '../product/product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from '../product/product-attribute-option.entity';
import { ItemAttributeValueEntity } from '../product/item-attribute-value.entity';
import {
  ImportDuplicateMode,
  InventoryImportExcelField,
  type InventoryImportExcelRow,
} from '@erp/shared-interfaces';
import {
  getExcelField,
  parseGroupedDecimal,
  parseGroupedInteger,
  parseIsActiveFromInactiveColumn,
  parseYesNoFlag,
} from './inventory-excel-parse.utils';
import { CreateItemUnitInput } from '../location/dto/create-item.dto';

export interface ExcelCommitStats {
  productsCreated: number;
  itemsCommitted: number;
}

@Injectable()
export class ExcelImportItemService {
  private readonly logger = new Logger(ExcelImportItemService.name);

  private readonly productCache = new Map<string, string>();
  private readonly attrDefCache = new Map<string, string>(); // "${productId}:${attrName.lower}" → defId
  private readonly attrOptCache = new Map<string, string>(); // "${defId}:${valueLabel.lower}" → optionId

  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(ItemBarcodeEntity)
    private readonly barcodeRepo: Repository<ItemBarcodeEntity>,
    @InjectRepository(ItemUnitEntity)
    private readonly unitRepo: Repository<ItemUnitEntity>,
    @InjectRepository(ProductAttributeDefinitionEntity)
    private readonly attrDefRepo: Repository<ProductAttributeDefinitionEntity>,
    @InjectRepository(ProductAttributeOptionEntity)
    private readonly attrOptRepo: Repository<ProductAttributeOptionEntity>,
    @InjectRepository(ItemAttributeValueEntity)
    private readonly attrValRepo: Repository<ItemAttributeValueEntity>,
    private readonly locationService: InventoryLocationService,
    private readonly itemCrudService: InventoryItemCrudService,
  ) {}

  resetCaches(): void {
    this.productCache.clear();
    this.attrDefCache.clear();
    this.attrOptCache.clear();
  }

  async commitRow(
    raw: InventoryImportExcelRow,
    duplicateMode: ImportDuplicateMode,
    actor: ActorContext,
    stats: ExcelCommitStats,
    productNamesCreated: Set<string>,
  ): Promise<void> {
    const sku = getExcelField(raw, InventoryImportExcelField.SKU_CODE);
    const existing = await this.itemRepo.findOne({
      where: { organizationId: actor.organizationId, code: sku },
    });

    if (existing && duplicateMode === ImportDuplicateMode.SKIP) {
      throw new ConflictException(`SKU "${sku}" already exists`);
    }

    const productId = await this.resolveProductId(raw, actor, productNamesCreated);
    const categoryId = await this.resolveCategoryId(raw, actor);

    const unitName = getExcelField(raw, InventoryImportExcelField.UNIT_NAME) || 'Đôi';
    const variantLabel = this.buildVariantLabel(raw);

    const payload: Record<string, unknown> = {
      code: sku,
      name: getExcelField(raw, InventoryImportExcelField.INVENTORY_ITEM_NAME),
      unit: unitName,
      categoryId,
      productId,
      brand: getExcelField(raw, InventoryImportExcelField.BRAND_NAME) || undefined,
      purchasePrice:
        parseGroupedDecimal(getExcelField(raw, InventoryImportExcelField.COST_PRICE)) ?? 0,
      sellingPrice:
        parseGroupedDecimal(getExcelField(raw, InventoryImportExcelField.UNIT_PRICE)) ?? 0,
      packageHeightCm: parseGroupedDecimal(
        getExcelField(raw, InventoryImportExcelField.HEIGHT),
      ),
      packageWidthCm: parseGroupedDecimal(
        getExcelField(raw, InventoryImportExcelField.WIDTH),
      ),
      packageLengthCm: parseGroupedDecimal(
        getExcelField(raw, InventoryImportExcelField.LENGTH),
      ),
      packageWeightGram: parseGroupedDecimal(
        getExcelField(raw, InventoryImportExcelField.WEIGHT),
      ),
      isActive: parseIsActiveFromInactiveColumn(
        getExcelField(raw, InventoryImportExcelField.INACTIVE),
      ),
      isPosVisible: parseYesNoFlag(
        getExcelField(raw, InventoryImportExcelField.SHOW_IN_MENU),
        true,
      ),
      oddSize: getExcelField(raw, InventoryImportExcelField.SIZE_RANGE) || undefined,
      composition:
        getExcelField(raw, InventoryImportExcelField.INGREDIENT) || undefined,
      manufactureYear: parseGroupedInteger(
        getExcelField(raw, InventoryImportExcelField.YEAR_OF_PRODUCTION),
      ),
      variantLabel: variantLabel || undefined,
      barcodes: this.buildBarcodes(raw),
      units: this.buildUnits(raw, unitName),
    };

    if (existing) {
      await this.itemCrudService.update(existing.id, payload, actor);
      await this.syncBarcodesAndUnits(existing.id, raw, unitName, actor);
      await this.commitRowAttributes(existing.id, productId, raw, actor);
      stats.itemsCommitted += 1;
      return;
    }

    const created = await this.itemCrudService.create(payload, actor);
    await this.commitRowAttributes(created.id, productId, raw, actor);
    stats.itemsCommitted += 1;
  }

  private buildVariantLabel(raw: InventoryImportExcelRow): string {
    const size = getExcelField(raw, InventoryImportExcelField.SIZE)?.trim();
    const color = getExcelField(raw, InventoryImportExcelField.COLOR)?.trim();
    return [size, color].filter(Boolean).join(' · ');
  }

  private buildBarcodes(raw: InventoryImportExcelRow) {
    const code = getExcelField(raw, InventoryImportExcelField.BAR_CODE);
    if (!code) return undefined;
    return [{ code }];
  }

  private buildUnits(
    raw: InventoryImportExcelRow,
    unitName: string,
  ): CreateItemUnitInput[] | undefined {
    const isSale = getExcelField(raw, InventoryImportExcelField.IS_SALE_UNIT);
    const isCost = getExcelField(raw, InventoryImportExcelField.IS_COST_UNIT);
    if (!isSale && !isCost) return undefined;
    return [
      {
        unitName,
        ratio: 1,
        isDefaultSell: parseYesNoFlag(isSale, false),
        isDefaultBuy: parseYesNoFlag(isCost, false),
      },
    ];
  }

  private async syncBarcodesAndUnits(
    itemId: string,
    raw: InventoryImportExcelRow,
    unitName: string,
    actor: ActorContext,
  ): Promise<void> {
    const barcode = getExcelField(raw, InventoryImportExcelField.BAR_CODE);
    if (barcode) {
      const existingBarcode = await this.barcodeRepo.findOne({
        where: { organizationId: actor.organizationId, code: barcode },
      });
      if (!existingBarcode) {
        await this.barcodeRepo.save(
          this.barcodeRepo.create({
            itemId,
            code: barcode,
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
          }),
        );
      }
    }

    const units = this.buildUnits(raw, unitName);
    if (!units?.length) return;

    const existingUnit = await this.unitRepo.findOne({
      where: { itemId, unitName },
    });
    const u = units[0];
    if (existingUnit) {
      existingUnit.isDefaultSell = u.isDefaultSell ?? false;
      existingUnit.isDefaultBuy = u.isDefaultBuy ?? false;
      await this.unitRepo.save(existingUnit);
    } else {
      await this.unitRepo.save(
        this.unitRepo.create({
          itemId,
          unitName,
          ratio: 1,
          purchasePrice: 0,
          sellPrice: 0,
          isDefaultSell: u.isDefaultSell ?? false,
          isDefaultBuy: u.isDefaultBuy ?? false,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
        }),
      );
    }
  }

  // ─── P2: Color / Size attribute values ──────────────────────────────

  private async commitRowAttributes(
    itemId: string,
    productId: string | undefined,
    raw: InventoryImportExcelRow,
    actor: ActorContext,
  ): Promise<void> {
    if (!productId) return;

    const attrs: Array<{ field: InventoryImportExcelField; attrName: string }> = [
      { field: InventoryImportExcelField.SIZE, attrName: 'Size' },
      { field: InventoryImportExcelField.COLOR, attrName: 'Color' },
    ];

    for (const { field, attrName } of attrs) {
      const value = getExcelField(raw, field)?.trim();
      if (!value) continue;

      const defId = await this.resolveOrCreateAttrDef(productId, attrName, actor);
      const optionId = await this.resolveOrCreateAttrOption(defId, value, actor);
      await this.upsertAttrValue(itemId, defId, optionId, actor);
    }
  }

  private async resolveOrCreateAttrDef(
    productId: string,
    name: string,
    actor: ActorContext,
  ): Promise<string> {
    const cacheKey = `${productId}:${name.toLowerCase()}`;
    const cached = this.attrDefCache.get(cacheKey);
    if (cached) return cached;

    const existing = await this.attrDefRepo
      .createQueryBuilder('d')
      .where('d.productId = :productId', { productId })
      .andWhere('d.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('LOWER(d.name) = LOWER(:name)', { name })
      .getOne();

    if (existing) {
      this.attrDefCache.set(cacheKey, existing.id);
      return existing.id;
    }

    const created = await this.attrDefRepo.save(
      this.attrDefRepo.create({
        productId,
        name,
        sortOrder: 0,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
    this.attrDefCache.set(cacheKey, created.id);
    return created.id;
  }

  private async resolveOrCreateAttrOption(
    defId: string,
    valueLabel: string,
    actor: ActorContext,
  ): Promise<string> {
    const cacheKey = `${defId}:${valueLabel.toLowerCase()}`;
    const cached = this.attrOptCache.get(cacheKey);
    if (cached) return cached;

    const existing = await this.attrOptRepo
      .createQueryBuilder('o')
      .where('o.attributeDefinitionId = :defId', { defId })
      .andWhere('o.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('LOWER(o.value_label) = LOWER(:valueLabel)', { valueLabel })
      .getOne();

    if (existing) {
      this.attrOptCache.set(cacheKey, existing.id);
      return existing.id;
    }

    const created = await this.attrOptRepo.save(
      this.attrOptRepo.create({
        attributeDefinitionId: defId,
        valueLabel,
        sortOrder: 0,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
    this.attrOptCache.set(cacheKey, created.id);
    return created.id;
  }

  private async upsertAttrValue(
    itemId: string,
    defId: string,
    optionId: string,
    actor: ActorContext,
  ): Promise<void> {
    const existing = await this.attrValRepo.findOne({
      where: { itemId, attributeDefinitionId: defId },
    });
    if (existing) {
      if (existing.optionId !== optionId) {
        existing.optionId = optionId;
        await this.attrValRepo.save(existing);
      }
      return;
    }
    await this.attrValRepo.save(
      this.attrValRepo.create({
        itemId,
        attributeDefinitionId: defId,
        optionId,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
  }

  // ─── P2: ModelCode / ItemCategoryCode resolution ────────────────────

  private async resolveCategoryId(
    raw: InventoryImportExcelRow,
    actor: ActorContext,
  ): Promise<string | undefined> {
    const code = getExcelField(raw, InventoryImportExcelField.ITEM_CATEGORY_CODE)?.trim();
    const name = getExcelField(raw, InventoryImportExcelField.ITEM_CATEGORY_NAME);

    if (code) {
      const cat = await this.locationService.resolveOrCreateCategoryByCode(code, name, actor);
      return cat.id;
    }
    if (name) {
      const cat = await this.locationService.resolveOrCreateCategoryByName(name, actor);
      return cat.id;
    }
    return undefined;
  }

  private async resolveProductId(
    raw: InventoryImportExcelRow,
    actor: ActorContext,
    productNamesCreated: Set<string>,
  ): Promise<string | undefined> {
    const code = getExcelField(raw, InventoryImportExcelField.MODEL_CODE)?.trim();
    const name = getExcelField(raw, InventoryImportExcelField.MODEL_NAME);

    if (code) {
      const cacheKey = `${actor.organizationId}:code:${code.toLowerCase()}`;
      const cached = this.productCache.get(cacheKey);
      if (cached) return cached;

      const existing = await this.productRepo.findOne({
        where: { organizationId: actor.organizationId, code },
      });
      if (existing) {
        this.productCache.set(cacheKey, existing.id);
        return existing.id;
      }

      if (!name) return undefined;

      const created = await this.productRepo.save(
        this.productRepo.create({
          code,
          name,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          isActive: true,
        }),
      );
      productNamesCreated.add(name.toLowerCase());
      this.productCache.set(cacheKey, created.id);
      return created.id;
    }

    return this.resolveProductIdByName(name, actor, productNamesCreated);
  }

  private async resolveProductIdByName(
    name: string | undefined,
    actor: ActorContext,
    productNamesCreated: Set<string>,
  ): Promise<string | undefined> {
    if (!name) return undefined;

    const cacheKey = `${actor.organizationId}:${name.toLowerCase()}`;
    const cached = this.productCache.get(cacheKey);
    if (cached) return cached;

    const existing = await this.productRepo
      .createQueryBuilder('p')
      .where('p.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('LOWER(p.name) = LOWER(:name)', { name })
      .getOne();

    if (existing) {
      this.productCache.set(cacheKey, existing.id);
      return existing.id;
    }

    const created = await this.productRepo.save(
      this.productRepo.create({
        name,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
        isActive: true,
      }),
    );
    productNamesCreated.add(name.toLowerCase());
    this.productCache.set(cacheKey, created.id);
    return created.id;
  }
}
