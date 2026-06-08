import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemEntity } from './item.entity';
import { ItemCostSnapshotService } from './item-cost-snapshot.service';

/**
 * Standalone module that exposes {@link ItemCostSnapshotService}.
 *
 * Kept separate from {@link InventoryLocationModule} so consumers of the
 * cost-snapshot helper (e.g. ledger consumers) can import it without pulling
 * in the full location module (which itself depends on `StockLedgerModule`
 * and would create a circular dependency for code living under the ledger).
 */
@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity])],
  providers: [ItemCostSnapshotService],
  exports: [ItemCostSnapshotService],
})
export class ItemCostSnapshotModule {}
