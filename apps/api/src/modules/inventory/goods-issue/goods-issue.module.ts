import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { GoodsIssueEntity } from './goods-issue.entity';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';
import { GoodsIssueService } from './goods-issue.service';
import { GoodsIssueController } from './goods-issue.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GoodsIssueEntity, GoodsIssueLineEntity]),
    StockLedgerModule,
    DocumentNumberingModule,
  ],
  controllers: [GoodsIssueController],
  providers: [GoodsIssueService],
  exports: [GoodsIssueService],
})
export class GoodsIssueModule {}
