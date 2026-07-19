import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashPaymentEntity } from '../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashPaymentLineEntity } from '../../accounting/cash-vouchers/cash-payments/cash-payment-line.entity';
import { CashReceiptEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashReceiptLineEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt-line.entity';
import { CashVoucherCategoryEntity } from '../../accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ProductEntity } from '../../inventory/product/product.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { InvoiceEntity } from '../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../pos/entities/invoice-item.entity';
import { RbacModule } from '../../rbac/rbac.module';
import { ReportTemplateEntity } from '../report-core/report-template.entity';
import { CreateProfitReportTemplateHandler } from './commands/create-profit-report-template.handler';
import { DeleteProfitReportTemplateHandler } from './commands/delete-profit-report-template.handler';
import { UpdateProfitReportTemplateHandler } from './commands/update-profit-report-template.handler';
import { ProfitReportController } from './profit-report.controller';
import { GetProfitReportColumnsHandler } from './queries/get-profit-report-columns.handler';
import { GetProfitReportTemplateHandler } from './queries/get-profit-report-template.handler';
import { GetReportFilterOptionsHandler } from './queries/get-report-filter-options.handler';
import { ListProfitReportTemplatesHandler } from './queries/list-profit-report-templates.handler';
import { SearchProfitReportHandler } from './queries/search-profit-report.handler';
import { ReportRegistry } from './report-definition';
import { BusinessResultsReport } from './reports/business-results.report';
import { GrossProfitByInvoiceReport } from './reports/gross-profit-by-invoice.report';
import { ProfitByItemReport } from './reports/profit-by-item.report';

@Module({
  imports: [
    CqrsModule,
    RbacModule,
    TypeOrmModule.forFeature([
      ReportTemplateEntity,
      InvoiceEntity,
      InvoiceItemEntity,
      ItemEntity,
      ItemCategoryEntity,
      LocationEntity,
      StorageEntity,
      ItemStorageLocationEntity,
      StockBalanceEntity,
      ProductEntity,
      BranchEntity,
      CashPaymentEntity,
      CashPaymentLineEntity,
      CashReceiptEntity,
      CashReceiptLineEntity,
      CashVoucherCategoryEntity,
    ]),
  ],
  controllers: [ProfitReportController],
  providers: [
    // Report definitions (one per report type — add new ones here + to the registry factory).
    ProfitByItemReport,
    GrossProfitByInvoiceReport,
    BusinessResultsReport,
    {
      provide: ReportRegistry,
      useFactory: (
        profitByItem: ProfitByItemReport,
        grossProfitByInvoice: GrossProfitByInvoiceReport,
        businessResults: BusinessResultsReport,
      ) =>
        new ReportRegistry([profitByItem, grossProfitByInvoice, businessResults]),
      inject: [ProfitByItemReport, GrossProfitByInvoiceReport, BusinessResultsReport],
    },
    // Handlers (search/columns/templates dispatch generically via ReportRegistry — no new handler per report type)
    GetProfitReportColumnsHandler,
    GetReportFilterOptionsHandler,
    SearchProfitReportHandler,
    ListProfitReportTemplatesHandler,
    GetProfitReportTemplateHandler,
    CreateProfitReportTemplateHandler,
    UpdateProfitReportTemplateHandler,
    DeleteProfitReportTemplateHandler,
  ],
})
export class ProfitReportModule {}
