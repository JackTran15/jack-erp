import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentAccountEntity } from '../../accounting/payment-accounts/payment-account.entity';
import { UserEntity } from '../../auth/user.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { CustomerEntity } from '../../customer/customer.entity';
import { CustomerGroupEntity } from '../../customer/customer-group.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { ProductEntity } from '../../inventory/product/product.entity';
import { ItemProviderEntity } from '../../inventory/location/item-provider.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ProviderEntity } from '../../inventory/location/provider.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { InvoiceEntity } from '../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../pos/entities/invoice-payment.entity';
import { InvoicePromotionEntity } from '../../promotion/invoice-promotion.entity';
import { EmployeeProfileEntity } from '../../rbac/employee/employee-profile.entity';
import { RbacModule } from '../../rbac/rbac.module';
import { CreateInvoiceReportTemplateHandler } from './commands/create-invoice-report-template.handler';
import { DeleteInvoiceReportTemplateHandler } from './commands/delete-invoice-report-template.handler';
import { UpdateInvoiceReportTemplateHandler } from './commands/update-invoice-report-template.handler';
import { InvoiceReportController } from './invoice-report.controller';
import { ReportTemplateEntity } from '../report-core/report-template.entity';
import { ReportTypeEntity } from './report-type.entity';
import { ReportTypeSyncService } from './report-type-sync.service';
import { GetInvoiceDetailHandler } from './queries/get-invoice-detail.handler';
import { GetInvoiceReportColumnsHandler } from './queries/get-invoice-report-columns.handler';
import { GetInvoiceReportTemplateHandler } from './queries/get-invoice-report-template.handler';
import { GetReportFilterOptionsHandler } from './queries/get-report-filter-options.handler';
import { ListInvoiceReportTemplatesHandler } from './queries/list-invoice-report-templates.handler';
import { ListInvoiceReportTypesHandler } from './queries/list-invoice-report-types.handler';
import { SearchInvoiceReportHandler } from './queries/search-invoice-report.handler';
import { ReportRegistry } from './report-definition';
import { DailySalesSummaryReport } from './reports/daily-sales-summary.report';
import { InvoiceOrderListingReport } from './reports/invoice-order-listing.report';
import { InvoiceItemRevenueDetailReport } from './reports/invoice-item-revenue-detail.report';
import { RevenueByItemReport } from './reports/revenue-by-item.report';

@Module({
  imports: [
    CqrsModule,
    RbacModule,
    TypeOrmModule.forFeature([
      ReportTemplateEntity,
      ReportTypeEntity,
      InvoiceEntity,
      InvoicePaymentEntity,
      InvoicePromotionEntity,
      PaymentAccountEntity,
      CustomerEntity,
      BranchEntity,
      EmployeeProfileEntity,
      InvoiceItemEntity,
      CustomerGroupEntity,
      UserEntity,
      ItemEntity,
      ItemCategoryEntity,
      ProductEntity,
      LocationEntity,
      ItemProviderEntity,
      ProviderEntity,
      StorageEntity,
      ItemStorageLocationEntity,
      StockBalanceEntity,
    ]),
  ],
  controllers: [InvoiceReportController],
  providers: [
    // Report definitions (one per report type — add new ones here + to the registry factory).
    DailySalesSummaryReport,
    InvoiceOrderListingReport,
    InvoiceItemRevenueDetailReport,
    RevenueByItemReport,
    {
      provide: ReportRegistry,
      useFactory: (
        daily: DailySalesSummaryReport,
        listing: InvoiceOrderListingReport,
        itemRevenue: InvoiceItemRevenueDetailReport,
        revenueByItem: RevenueByItemReport,
      ) => new ReportRegistry([daily, listing, itemRevenue, revenueByItem]),
      inject: [
        DailySalesSummaryReport,
        InvoiceOrderListingReport,
        InvoiceItemRevenueDetailReport,
        RevenueByItemReport,
      ],
    },
    // Report-type catalogue sync (seeds report_types on boot)
    ReportTypeSyncService,
    // Handlers (search/columns/types dispatch generically via ReportRegistry — no new handler per report type)
    GetInvoiceReportColumnsHandler,
    GetReportFilterOptionsHandler,
    SearchInvoiceReportHandler,
    GetInvoiceDetailHandler,
    ListInvoiceReportTypesHandler,
    ListInvoiceReportTemplatesHandler,
    GetInvoiceReportTemplateHandler,
    CreateInvoiceReportTemplateHandler,
    UpdateInvoiceReportTemplateHandler,
    DeleteInvoiceReportTemplateHandler,
  ],
})
export class InvoiceReportModule {}
