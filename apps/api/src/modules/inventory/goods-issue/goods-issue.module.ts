import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { IssueReasonEntity } from '../issue-reason/issue-reason.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { GoodsIssueEntity } from './goods-issue.entity';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';
import { GoodsIssueService } from './goods-issue.service';
import { GoodsIssueController } from './goods-issue.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GoodsIssueEntity,
      GoodsIssueLineEntity,
      IssueReasonEntity,
      BranchEntity,
    ]),
    StockLedgerModule,
    DocumentNumberingModule,
  ],
  controllers: [GoodsIssueController],
  providers: [GoodsIssueService],
  exports: [GoodsIssueService],
})
export class GoodsIssueModule {}
