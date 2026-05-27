import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  InventoryImportExcelField,
  PaginationQuery,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../location/item.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';
import { InventoryImportWorkbookService } from './import-workbook/inventory-import-workbook.service';
import { buildInventoryImportDelimitedCsv } from './inventory-import-delimited-export.utils';
import {
  formatInventoryImportGroupedNumber,
  parseGroupedDecimal,
} from './inventory-excel-parse.utils';

interface ExportQuery extends PaginationQuery {
  branchId?: string;
  categoryId?: string;
  fromDate?: string;
  toDate?: string;
  locationId?: string;
  itemId?: string;
}

@Injectable()
export class CsvExportService {
  private readonly logger = new Logger(CsvExportService.name);

  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    @InjectRepository(StockLedgerEntryEntity)
    private readonly ledgerRepo: Repository<StockLedgerEntryEntity>,
    private readonly workbookService: InventoryImportWorkbookService,
  ) {}

  async exportItems(
    query: ExportQuery,
    actor: ActorContext,
  ): Promise<string> {
    // Export ITEMS in the same 4-header grid layout used by the Excel import template.
    // Delimiter: semicolon `;`.
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.barcodes', 'barcodes')
      .leftJoinAndSelect('item.units', 'units')
      .where('item.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.categoryId) {
      qb.andWhere('item.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    qb.orderBy('item.code', 'ASC');

    const items = await qb.getMany();
    const dataRows = items.map((item) => ({
      rawData: this.itemToExcelRow(item),
    }));

    return buildInventoryImportDelimitedCsv(dataRows);
  }

  async exportItemsExcelBuffer(
    query: ExportQuery,
    actor: ActorContext,
  ): Promise<Buffer> {
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.barcodes', 'barcodes')
      .leftJoinAndSelect('item.units', 'units')
      .where('item.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.categoryId) {
      qb.andWhere('item.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    qb.orderBy('item.code', 'ASC');

    const items = await qb.getMany();
    const dataRows = items.map((item) => this.itemToExcelRow(item));

    return this.workbookService.buildItemsWorkbookBuffer(dataRows);
  }

  async exportItemsTemplateBuffer(_actor: ActorContext): Promise<Buffer> {
    return this.workbookService.buildItemsWorkbookBuffer([]);
  }

  private itemToExcelRow(item: ItemEntity): Record<string, string | number> {
    const primaryBarcode = item.barcodes?.[0]?.code ?? item.code;
    const defaultSellUnit = item.units?.find((u) => u.isDefaultSell);
    const defaultBuyUnit = item.units?.find((u) => u.isDefaultBuy);

    return {
      SKUCode: item.code,
      Barcode: primaryBarcode,
      ModelCode: '',
      ModelName: item.product?.name ?? '',
      InventoryItemName: item.name,
      ItemCategoryCode: '',
      ItemCategoryName: item.category?.name ?? '',
      BrandName: item.brand ?? '',
      UnitName: item.unit,
      Color: '',
      Size: '',
      CostPrice: this.toExportNumber(item.purchasePrice),
      UnitPrice: this.toExportNumber(item.sellingPrice),
      TaxRate: '',
      OpeningQuantity: '',
      OpeningAmount: '',
      OpeningStockName: '',
      MinimumStock: '',
      MaximumStock: '',
      UnitConvertName: '',
      UnitConvertRate: '',
      UnitConvertCostPrice: '',
      UnitConvertSalePrice: '',
      IsSaleUnit: defaultSellUnit?.isDefaultSell ? 'Có' : '',
      IsCostUnit: defaultBuyUnit?.isDefaultBuy ? 'Có' : '',
      ImageUrl: '',
      Height: this.toExportNumber(item.packageHeightCm),
      Width: this.toExportNumber(item.packageWidthCm),
      Length: this.toExportNumber(item.packageLengthCm),
      Weight: this.toExportNumber(item.packageWeightGram),
      ShowLocation: '',
      StockLocation: '',
      IsUseLotNo: '',
      SellBeforeDay: '',
      IsUseSerial: '',
      ShowInMenu: item.isPosVisible ? 'Có' : 'Không',
      Description: item.description ?? '',
      Inactive: item.isActive ? '' : 'Có',
      SizeRange: item.oddSize ?? '',
      Ingredient: item.composition ?? '',
      YearOfProduction: this.toExportNumber(item.manufactureYear),
      UnitPriceBox: '',
      UnitPriceWholeSale: '',
    };
  }

  /** TypeORM `decimal` may arrive as string — normalize before export. */
  private toExportNumber(
    value: number | string | null | undefined,
  ): number | '' {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : '';
    }
    const parsed = parseGroupedDecimal(String(value));
    return parsed ?? '';
  }

  async exportBalances(
    query: ExportQuery,
    actor: ActorContext,
  ): Promise<string> {
    const qb = this.balanceRepo
      .createQueryBuilder('bal')
      .leftJoinAndSelect('bal.item', 'item')
      .leftJoinAndSelect('bal.location', 'location')
      .where('bal.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.branchId) {
      qb.andWhere('bal.branchId = :branchId', { branchId: query.branchId });
    }
    if (query.itemId) {
      qb.andWhere('bal.itemId = :itemId', { itemId: query.itemId });
    }
    if (query.locationId) {
      qb.andWhere('bal.locationId = :locationId', { locationId: query.locationId });
    }

    qb.orderBy('bal.itemId', 'ASC').addOrderBy('bal.locationId', 'ASC');

    const balances = await qb.getMany();

    const headers = [
      'itemId',
      'locationId',
      'branchId',
      'quantity',
      'lastMovementAt',
    ];
    const rows = balances.map((b) =>
      [
        b.itemId,
        b.locationId,
        b.branchId ?? '',
        String(b.quantity),
        b.lastMovementAt?.toISOString() ?? '',
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  async exportLedger(
    query: ExportQuery,
    actor: ActorContext,
  ): Promise<string> {
    const qb = this.ledgerRepo
      .createQueryBuilder('entry')
      .where('entry.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.branchId) {
      qb.andWhere('entry.branchId = :branchId', { branchId: query.branchId });
    }
    if (query.itemId) {
      qb.andWhere('entry.itemId = :itemId', { itemId: query.itemId });
    }
    if (query.locationId) {
      qb.andWhere('entry.locationId = :locationId', { locationId: query.locationId });
    }
    if (query.fromDate) {
      qb.andWhere('entry.postedAt >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('entry.postedAt <= :toDate', { toDate: query.toDate });
    }

    qb.orderBy('entry.postedAt', 'DESC');

    const entries = await qb.getMany();

    const headers = [
      'id',
      'itemId',
      'locationId',
      'branchId',
      'movementType',
      'quantity',
      'referenceType',
      'referenceId',
      'notes',
      'postedAt',
    ];
    const rows = entries.map((e) =>
      [
        e.id,
        e.itemId,
        e.locationId,
        e.branchId ?? '',
        e.movementType,
        String(e.quantity),
        this.escapeCsv(e.referenceType),
        e.referenceId,
        this.escapeCsv(e.notes ?? ''),
        e.postedAt.toISOString(),
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

