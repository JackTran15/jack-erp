import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { StockLedgerEntryEntity } from './stock-ledger-entry.entity';
import { StockBalanceEntity } from './stock-balance.entity';
import { StockLedgerService } from './stock-ledger.service';
import { StockLedgerController } from './stock-ledger.controller';
import { StockSummaryService } from './stock-summary.service';
import { StockSummaryController } from './stock-summary.controller';
import {
  InventoryStockBalanceCrudService,
  INVENTORY_STOCK_BALANCE_ENTITY_CONFIG,
  INVENTORY_STOCK_BALANCE_SERVICE_TOKEN,
} from './stock-balance-crud.service';
import { ProductModule } from '../product/product.module';
import { StockDeductionPublisher } from '../publishers/stock-deduction.publisher';
import { StockDeductionConsumer } from '../consumers/stock-deduction.consumer';
import { StockReturnConsumer } from '../consumers/stock-return.consumer';
import { StockReturnInConsumer } from '../consumers/stock-return-in.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLedgerEntryEntity, StockBalanceEntity]),
    ProductModule,
  ],
  controllers: [StockLedgerController, StockSummaryController],
  providers: [
    StockLedgerService,
    StockSummaryService,
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
