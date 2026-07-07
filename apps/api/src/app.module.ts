import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { RedisModule } from './modules/redis/redis.module';
import { CrudModule } from './modules/crud/crud.module';
import { CommonModule } from './common/common.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { BranchModule } from './modules/branch/branch.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { DocumentNumberingModule } from './modules/document-numbering/document-numbering.module';
import { SalesHierarchyModule } from './modules/sales-hierarchy/sales-hierarchy.module';
import { EventsModule } from './modules/events/events.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { CustomerModule } from './modules/customer/customer.module';
import { InventoryLocationModule } from './modules/inventory/location/inventory-location.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { StockLedgerModule } from './modules/inventory/ledger/stock-ledger.module';
import { StockTransferModule } from './modules/inventory/transfer/stock-transfer.module';
import { StockAdjustmentModule } from './modules/inventory/adjustment/stock-adjustment.module';
import { TempWarehouseModule } from './modules/inventory/temp-warehouse/temp-warehouse.module';
import { InventoryCsvModule } from './modules/inventory/csv/inventory-csv.module';
import { PosModule } from './modules/pos/pos.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { InvoiceReportModule } from './modules/reporting/invoice-report/invoice-report.module';
import { PurchaseOrderModule } from './modules/inventory/purchase-order/purchase-order.module';
import { GoodsIssueModule } from './modules/inventory/goods-issue/goods-issue.module';
import { IssueReasonModule } from './modules/inventory/issue-reason/issue-reason.module';
import { GoodsReceiptModule } from './modules/inventory/goods-receipt/goods-receipt.module';
import { StockTakeModule } from './modules/inventory/stock-take/stock-take.module';
import { TransferOrderModule } from './modules/inventory/transfer-order/transfer-order.module';
import { ProductModule } from './modules/inventory/product/product.module';
import { PromotionModule } from './modules/promotion/promotion.module';
import { JobPositionModule } from './modules/hr/job-position/job-position.module';
import { InventoryReportsModule } from './modules/inventory-reports/inventory-reports.module';
import { AdminSearchModule } from './modules/admin-search/admin-search.module';
import { CounterpartyModule } from './modules/counterparty/counterparty.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Resolve from this package root so `pnpm dev:api` from monorepo root still loads apps/api/.env.
      // NestJS ConfigModule honours the FIRST file that defines a given key, so order matters:
      //   1. apps/api/.env            — per-package override (legacy, optional)
      //   2. <monorepo-root>/.env     — where credentials actually live now
      //   3. apps/api/.env.example    — last-resort placeholder defaults
      envFilePath: [
        join(__dirname, '..', '.env'),
        join(__dirname, '..', '..', '..', '.env'),
        join(__dirname, '..', '.env.example'),
      ],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5433),
        database: config.get<string>('DB_NAME', 'erp_dev'),
        username: config.get<string>('DB_USER', 'erp_user'),
        password: config.get<string>('DB_PASS', 'erp_secret'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),

    ScheduleModule.forRoot(),

    HealthModule,
    MetricsModule,
    RedisModule,
    CrudModule,
    CommonModule,
    AuthModule,
    RbacModule,
    OrganizationModule,
    BranchModule,
    RegistrationModule,
    DocumentNumberingModule,
    SalesHierarchyModule,
    EventsModule,
    WebSocketModule,
    CustomerModule,
    InventoryLocationModule,
    AccountingModule,
    StockLedgerModule,
    StockTransferModule,
    StockAdjustmentModule,
    TempWarehouseModule,
    InventoryCsvModule,
    PosModule,
    ReportingModule,
    InvoiceReportModule,
    PurchaseOrderModule,
    GoodsIssueModule,
    IssueReasonModule,
    GoodsReceiptModule,
    StockTakeModule,
    TransferOrderModule,
    ProductModule,
    PromotionModule,
    JobPositionModule,
    InventoryReportsModule,
    AdminSearchModule,
    CounterpartyModule,
  ],
})
export class AppModule {}
