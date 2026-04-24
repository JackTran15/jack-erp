import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { StockAdjustmentEntity } from './stock-adjustment.entity';
import { StockAdjustmentLineEntity } from './stock-adjustment-line.entity';
import { StockAdjustmentService } from './stock-adjustment.service';
import { StockAdjustmentController } from './stock-adjustment.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockAdjustmentEntity,
      StockAdjustmentLineEntity,
    ]),
    StockLedgerModule,
    DocumentNumberingModule,
  ],
  controllers: [StockAdjustmentController],
  providers: [StockAdjustmentService],
  exports: [StockAdjustmentService],
})
export class StockAdjustmentModule {}
