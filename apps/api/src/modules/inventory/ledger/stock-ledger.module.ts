import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerEntryEntity } from './stock-ledger-entry.entity';
import { StockBalanceEntity } from './stock-balance.entity';
import { StockLedgerService } from './stock-ledger.service';
import { StockLedgerController } from './stock-ledger.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLedgerEntryEntity, StockBalanceEntity]),
  ],
  controllers: [StockLedgerController],
  providers: [StockLedgerService],
  exports: [StockLedgerService],
})
export class StockLedgerModule {}
