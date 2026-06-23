import { Module } from '@nestjs/common';
import { InventoryReportsController } from './inventory-reports.controller';
import { InventoryReportsService } from './inventory-reports.service';
import { StockPeriodService } from './services/stock-period.service';
import { StockBalancePivotService } from './services/stock-balance-pivot.service';
import { TransferReportService } from './services/transfer-report.service';
import { DocumentDetailService } from './services/document-detail.service';
import { TempWarehouseReportService } from './services/temp-warehouse-report.service';

/**
 * Inventory reports module — Tasks 4, 5, 6.
 *
 * `RedisModule` is `@Global()` so `CacheService` is injectable without an
 * explicit import. `RbacModule` is `@Global()` so `PermissionGuard` /
 * `BranchScopeGuard` are available. `AuthGuard` is registered globally
 * via `APP_GUARD` in `CommonModule`. `DataSource` is provided by the
 * root `TypeOrmModule.forRoot(...)`.
 */
@Module({
  controllers: [InventoryReportsController],
  providers: [
    InventoryReportsService,
    StockPeriodService,
    StockBalancePivotService,
    TransferReportService,
    DocumentDetailService,
    TempWarehouseReportService,
  ],
})
export class InventoryReportsModule {}
