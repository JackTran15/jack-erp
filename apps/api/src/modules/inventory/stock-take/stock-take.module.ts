import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DocumentNumberingModule } from "../../document-numbering/document-numbering.module";
import { StockLedgerModule } from "../ledger/stock-ledger.module";
import { StockBalanceEntity } from "../ledger/stock-balance.entity";
import { GoodsReceiptEntity } from "../goods-receipt/goods-receipt.entity";
import { GoodsReceiptLineEntity } from "../goods-receipt/goods-receipt-line.entity";
import { GoodsIssueEntity } from "../goods-issue/goods-issue.entity";
import { GoodsIssueLineEntity } from "../goods-issue/goods-issue-line.entity";
import { LocationEntity } from "../location/location.entity";
import { StorageEntity } from "../location/storage.entity";
import { ItemCostSnapshotModule } from "../location/item-cost-snapshot.module";
import { StockTakeEntity } from "./stock-take.entity";
import { StockTakeLineEntity } from "./stock-take-line.entity";
import { StockTakeMemberEntity } from "./stock-take-member.entity";
import { StockTakeService } from "./stock-take.service";
import { StockTakeController } from "./stock-take.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockTakeEntity,
      StockTakeLineEntity,
      StockTakeMemberEntity,
      StockBalanceEntity,
      LocationEntity,
      StorageEntity,
      GoodsReceiptEntity,
      GoodsReceiptLineEntity,
      GoodsIssueEntity,
      GoodsIssueLineEntity,
    ]),
    StockLedgerModule,
    DocumentNumberingModule,
    ItemCostSnapshotModule,
  ],
  controllers: [StockTakeController],
  providers: [StockTakeService],
  exports: [StockTakeService],
})
export class StockTakeModule {}
