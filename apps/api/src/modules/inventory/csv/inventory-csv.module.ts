import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryLocationModule } from '../location/inventory-location.module';
import { ProductModule } from '../product/product.module';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { WebSocketModule } from '../../websocket/websocket.module';
import { InventoryImportJobEntity } from './inventory-import-job.entity';
import { InventoryImportJobRowEntity } from './inventory-import-job-row.entity';
import { CsvImportService } from './csv-import.service';
import { CsvExportService } from './csv-export.service';
import { ExcelParserService } from './excel-parser.service';
import { ExcelImportItemService } from './excel-import-item.service';
import { InventoryImportWorkbookService } from './import-workbook/inventory-import-workbook.service';
import { CsvImportController } from './csv-import.controller';
import { CsvExportController } from './csv-export.controller';
import { ItemEntity } from '../location/item.entity';
import { ItemProviderEntity } from '../location/item-provider.entity';
import { ItemBarcodeEntity } from '../location/item-barcode.entity';
import { ItemUnitEntity } from '../location/item-unit.entity';
import { ProductEntity } from '../product/product.entity';
import { ProductAttributeDefinitionEntity } from '../product/product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from '../product/product-attribute-option.entity';
import { ItemAttributeValueEntity } from '../product/item-attribute-value.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryImportJobEntity,
      InventoryImportJobRowEntity,
      ItemEntity,
      ItemProviderEntity,
      ItemBarcodeEntity,
      ItemUnitEntity,
      ProductEntity,
      ProductAttributeDefinitionEntity,
      ProductAttributeOptionEntity,
      ItemAttributeValueEntity,
      StockBalanceEntity,
      StockLedgerEntryEntity,
    ]),
    InventoryLocationModule,
    ProductModule,
    StockLedgerModule,
    WebSocketModule,
  ],
  controllers: [CsvImportController, CsvExportController],
  providers: [
    CsvImportService,
    CsvExportService,
    ExcelParserService,
    ExcelImportItemService,
    InventoryImportWorkbookService,
  ],
  exports: [CsvImportService, CsvExportService],
})
export class InventoryCsvModule {}
