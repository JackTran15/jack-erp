import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryLocationModule } from '../location/inventory-location.module';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { WebSocketModule } from '../../websocket/websocket.module';
import { InventoryImportJobEntity } from './inventory-import-job.entity';
import { InventoryImportJobRowEntity } from './inventory-import-job-row.entity';
import { CsvImportService } from './csv-import.service';
import { CsvExportService } from './csv-export.service';
import { CsvImportController } from './csv-import.controller';
import { CsvExportController } from './csv-export.controller';
import { ItemEntity } from '../location/item.entity';
import { ItemProviderEntity } from '../location/item-provider.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryImportJobEntity,
      InventoryImportJobRowEntity,
      ItemEntity,
      ItemProviderEntity,
      StockBalanceEntity,
      StockLedgerEntryEntity,
    ]),
    InventoryLocationModule,
    StockLedgerModule,
    WebSocketModule,
  ],
  controllers: [CsvImportController, CsvExportController],
  providers: [CsvImportService, CsvExportService],
  exports: [CsvImportService, CsvExportService],
})
export class InventoryCsvModule {}
