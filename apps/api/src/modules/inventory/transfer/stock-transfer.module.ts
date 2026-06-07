import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { StockTransferEntity } from './stock-transfer.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';
import { LocationEntity } from '../location/location.entity';
import { StockTransferService } from './stock-transfer.service';
import { StockTransferController } from './stock-transfer.controller';
import { StockTransferV2Controller } from './controllers/stock-transfer-v2.controller';
import { SearchStockTransfersV2Handler } from './queries/search-stock-transfers-v2.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([StockTransferEntity, StockTransferLineEntity, LocationEntity]),
    StockLedgerModule,
    DocumentNumberingModule,
  ],
  controllers: [StockTransferController, StockTransferV2Controller],
  providers: [StockTransferService, SearchStockTransfersV2Handler],
  exports: [StockTransferService],
})
export class StockTransferModule {}
