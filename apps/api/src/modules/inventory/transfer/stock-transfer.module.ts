import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { StockTransferEntity } from './stock-transfer.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';
import { StockTransferService } from './stock-transfer.service';
import { StockTransferController } from './stock-transfer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockTransferEntity, StockTransferLineEntity]),
    StockLedgerModule,
    DocumentNumberingModule,
  ],
  controllers: [StockTransferController],
  providers: [StockTransferService],
  exports: [StockTransferService],
})
export class StockTransferModule {}
