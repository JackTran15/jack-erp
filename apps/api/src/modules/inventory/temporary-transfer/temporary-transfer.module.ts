import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { InventoryLocationModule } from '../location/inventory-location.module';
import { TemporaryTransferEntity } from './temporary-transfer.entity';
import { TemporaryTransferLineEntity } from './temporary-transfer-line.entity';
import { TemporaryTransferService } from './temporary-transfer.service';
import { TemporaryTransferController } from './temporary-transfer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TemporaryTransferEntity,
      TemporaryTransferLineEntity,
      StockBalanceEntity,
    ]),
    StockLedgerModule,
    DocumentNumberingModule,
    InventoryLocationModule,
  ],
  controllers: [TemporaryTransferController],
  providers: [TemporaryTransferService],
  exports: [TemporaryTransferService],
})
export class TemporaryTransferModule {}
