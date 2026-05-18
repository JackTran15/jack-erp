import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockTakeEntity } from './stock-take.entity';
import { StockTakeLineEntity } from './stock-take-line.entity';
import { StockTakeService } from './stock-take.service';
import { StockTakeController } from './stock-take.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockTakeEntity,
      StockTakeLineEntity,
      StockBalanceEntity,
    ]),
    StockLedgerModule,
  ],
  controllers: [StockTakeController],
  providers: [StockTakeService],
  exports: [StockTakeService],
})
export class StockTakeModule {}
