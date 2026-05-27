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

  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(ItemBarcodeEntity)
    private readonly barcodeRepo: Repository<ItemBarcodeEntity>,
    @InjectRepository(ItemUnitEntity)
    private readonly unitRepo: Repository<ItemUnitEntity>,
    private readonly locationService: InventoryLocationService,
    private readonly itemCrudService: InventoryItemCrudService,
  ) {}

  resetCaches(): void {
    this.productCache.clear();
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
      barcodes: this.buildBarcodes(raw),
      units: this.buildUnits(raw, unitName),
    };

    if (existing) {
      await this.itemCrudService.update(
        existing.id,
        payload,
        actor,
      );
      await this.syncBarcodesAndUnits(existing.id, raw, unitName, actor);
      stats.itemsCommitted += 1;
      return;
    }

    await this.itemCrudService.create(payload, actor);
    stats.itemsCommitted += 1;
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

  private async resolveCategoryId(
    raw: InventoryImportExcelRow,
    actor: ActorContext,
  ): Promise<string | undefined> {
    const name = getExcelField(raw, InventoryImportExcelField.ITEM_CATEGORY_NAME);
    if (!name) return undefined;
    const cat = await this.locationService.resolveOrCreateCategoryByName(
      name,
      actor,
    );
    return cat.id;
  }

  private async resolveProductId(
    raw: InventoryImportExcelRow,
    actor: ActorContext,
    productNamesCreated: Set<string>,
  ): Promise<string | undefined> {
    const name = getExcelField(raw, InventoryImportExcelField.MODEL_NAME);
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
