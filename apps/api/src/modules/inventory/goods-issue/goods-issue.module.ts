import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { IssueReasonEntity } from '../issue-reason/issue-reason.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { GoodsIssueEntity } from './goods-issue.entity';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';
import { GoodsIssueService } from './goods-issue.service';
import { GoodsIssueController } from './goods-issue.controller';
import { GoodsIssueV2Controller } from './controllers/goods-issue-v2.controller';
import { GoodsIssueCommandV2Controller } from './controllers/goods-issue-command-v2.controller';
import { SearchGoodsIssuesV2Handler } from './queries/search-goods-issues-v2.handler';
import { CreateGoodsIssueV2Handler } from './commands/create-goods-issue-v2.handler';
import { PostGoodsIssueV2Handler } from './commands/post-goods-issue-v2.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      GoodsIssueEntity,
      GoodsIssueLineEntity,
      IssueReasonEntity,
      BranchEntity,
    ]),
    StockLedgerModule,
    DocumentNumberingModule,
  ],
  controllers: [
    GoodsIssueController,
    GoodsIssueV2Controller,
    GoodsIssueCommandV2Controller,
  ],
  providers: [
    GoodsIssueService,
    SearchGoodsIssuesV2Handler,
    CreateGoodsIssueV2Handler,
    PostGoodsIssueV2Handler,
  ],
  exports: [GoodsIssueService],
})
export class GoodsIssueModule {}
