import { Module, OnModuleInit } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EntityRegistryService } from "../../crud/entity-registry.service";
import { StockLedgerEntryEntity } from "./stock-ledger-entry.entity";
import { StockBalanceEntity } from "./stock-balance.entity";
import { StockLedgerService } from "./stock-ledger.service";
import { StockLedgerController } from "./stock-ledger.controller";
import { StockSummaryService } from "./stock-summary.service";
import { StockSummaryController } from "./stock-summary.controller";
import { StockSummaryV2Controller } from "./stock-summary-v2.controller";
import { SearchStockSummaryV2Handler } from "./queries/search-stock-summary-v2.handler";
import {
  InventoryStockBalanceCrudService,
  INVENTORY_STOCK_BALANCE_ENTITY_CONFIG,
  INVENTORY_STOCK_BALANCE_SERVICE_TOKEN,
} from "./stock-balance-crud.service";
import { ProductModule } from "../product/product.module";
import { ItemCostSnapshotModule } from "../location/item-cost-snapshot.module";
import { StockDeductionPublisher } from "../publishers/stock-deduction.publisher";
import { StockDeductionConsumer } from "../consumers/stock-deduction.consumer";
import { StockReturnConsumer } from "../consumers/stock-return.consumer";
import { StockReturnInConsumer } from "../consumers/stock-return-in.consumer";
import { ItemEntity } from "../location/item.entity";
import { ItemAttributeValueEntity } from "../product/item-attribute-value.entity";
import { BranchEntity } from "../../branch/branch.entity";
import { StockSummaryExportService } from "./stock-summary-export.service";

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      StockLedgerEntryEntity,
      StockBalanceEntity,
      ItemEntity,
      ItemAttributeValueEntity,
      BranchEntity,
    ]),
    ProductModule,
    ItemCostSnapshotModule,
  ],
  controllers: [
    StockLedgerController,
    StockSummaryController,
    StockSummaryV2Controller,
  ],
  providers: [
    StockLedgerService,
    StockSummaryService,
    StockSummaryExportService,
    SearchStockSummaryV2Handler,
    InventoryStockBalanceCrudService,
    {
      provide: INVENTORY_STOCK_BALANCE_SERVICE_TOKEN,
      useExisting: InventoryStockBalanceCrudService,
    },
    StockDeductionPublisher,
    StockDeductionConsumer,
    StockReturnConsumer,
    StockReturnInConsumer,
  ],
  exports: [StockLedgerService, StockDeductionPublisher],
})
export class StockLedgerModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      INVENTORY_STOCK_BALANCE_ENTITY_CONFIG,
      INVENTORY_STOCK_BALANCE_SERVICE_TOKEN,
    );
  }
}
