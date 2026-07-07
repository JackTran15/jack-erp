import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from '../branch/branch.entity';
import { ReportTemplateEntity } from '../reporting/report-core/report-template.entity';
import { ItemEntity } from '../inventory/location/item.entity';
import { ItemCategoryEntity } from '../inventory/location/item-category.entity';
import { ItemProviderEntity } from '../inventory/location/item-provider.entity';
import { LocationEntity } from '../inventory/location/location.entity';
import { StorageEntity } from '../inventory/location/storage.entity';
import { CreateInventoryReportTemplateHandler } from './commands/create-inventory-report-template.handler';
import { DeleteInventoryReportTemplateHandler } from './commands/delete-inventory-report-template.handler';
import { UpdateInventoryReportTemplateHandler } from './commands/update-inventory-report-template.handler';
import { InventoryReportV2Controller } from './inventory-report-v2.controller';
import { InventoryReportsController } from './inventory-reports.controller';
import { InventoryReportsService } from './inventory-reports.service';
import { GetInventoryReportTemplateHandler } from './queries/get-inventory-report-template.handler';
import { ListInventoryReportTemplatesHandler } from './queries/list-inventory-report-templates.handler';
import { GetInventoryFilterOptionsHandler } from './queries/get-inventory-filter-options.handler';
import { GetInventoryReportColumnsHandler } from './queries/get-inventory-report-columns.handler';
import { SearchInventoryReportHandler } from './queries/search-inventory-report.handler';
import {
  InventoryReportDefinition,
  InventoryReportRegistry,
} from './report/inventory-report-definition';
import { DocumentDetailReport } from './report/reports/document-detail.report';
import { StockByStorePivotReport } from './report/reports/stock-by-store-pivot.report';
import { StockQuantityDetailReport } from './report/reports/stock-quantity-detail.report';
import { StockSummaryReport } from './report/reports/stock-summary.report';
import { StockSummaryByStoreReport } from './report/reports/stock-summary-by-store.report';
import { TempWarehouseOutReport } from './report/reports/temp-warehouse-out.report';
import { TransferByStoreReport } from './report/reports/transfer-by-store.report';
import { TransferSummaryReport } from './report/reports/transfer-summary.report';
import { DocumentDetailService } from './services/document-detail.service';
import { StockBalancePivotService } from './services/stock-balance-pivot.service';
import { StockPeriodService } from './services/stock-period.service';
import { TempWarehouseReportService } from './services/temp-warehouse-report.service';
import { TransferReportService } from './services/transfer-report.service';

/** Every registered inventory report definition (order = catalog order). */
const REPORT_DEFINITIONS = [
  StockSummaryReport,
  DocumentDetailReport,
  StockQuantityDetailReport,
  StockSummaryByStoreReport,
  StockByStorePivotReport,
  TransferSummaryReport,
  TransferByStoreReport,
  TempWarehouseOutReport,
];

/**
 * Inventory reports module.
 *
 * Legacy surface: `InventoryReportsController` + facade service (kept as-is,
 * still serving `pages/reports/storage/*`). New surface: the registry-driven
 * v2 contract (`InventoryReportV2Controller` + CQRS handlers), mirroring the
 * invoice report architecture.
 *
 * `RedisModule` is `@Global()` so `CacheService` is injectable without an
 * explicit import. `RbacModule` is `@Global()` so `PermissionGuard` is
 * available. `AuthGuard` is registered globally via `APP_GUARD` in
 * `CommonModule`. `DataSource` is provided by the root
 * `TypeOrmModule.forRoot(...)`.
 */
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      BranchEntity,
      ItemEntity,
      ItemCategoryEntity,
      ItemProviderEntity,
      LocationEntity,
      StorageEntity,
      ReportTemplateEntity,
    ]),
  ],
  controllers: [InventoryReportsController, InventoryReportV2Controller],
  providers: [
    InventoryReportsService,
    StockPeriodService,
    StockBalancePivotService,
    TransferReportService,
    DocumentDetailService,
    TempWarehouseReportService,
    ...REPORT_DEFINITIONS,
    {
      provide: InventoryReportRegistry,
      inject: REPORT_DEFINITIONS,
      useFactory: (...definitions: InventoryReportDefinition[]) =>
        new InventoryReportRegistry(definitions),
    },
    GetInventoryReportColumnsHandler,
    GetInventoryFilterOptionsHandler,
    SearchInventoryReportHandler,
    CreateInventoryReportTemplateHandler,
    UpdateInventoryReportTemplateHandler,
    DeleteInventoryReportTemplateHandler,
    ListInventoryReportTemplatesHandler,
    GetInventoryReportTemplateHandler,
  ],
})
export class InventoryReportsModule {}
