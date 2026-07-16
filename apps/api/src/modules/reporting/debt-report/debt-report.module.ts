import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashReceiptEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { ReceivableEntity } from '../../accounting/receivables/receivable.entity';
import { ReceivableSettlementEntity } from '../../accounting/receivables/receivable-settlement.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { CustomerEntity } from '../../customer/customer.entity';
import { CustomerGroupEntity } from '../../customer/customer-group.entity';
import { MembershipCardEntity } from '../../customer/membership-card.entity';
import { GoodsReceiptLineEntity } from '../../inventory/goods-receipt/goods-receipt-line.entity';
import { GoodsReceiptEntity } from '../../inventory/goods-receipt/goods-receipt.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ProviderEntity } from '../../inventory/location/provider.entity';
import { SupplierGroupEntity } from '../../inventory/location/supplier-group.entity';
import { ProductEntity } from '../../inventory/product/product.entity';
import { SupplierDebtPaymentEntity } from '../../inventory/supplier-debt/supplier-debt-payment.entity';
import { SupplierDebtEntity } from '../../inventory/supplier-debt/supplier-debt.entity';
import { DebtPaymentEntity } from '../../pos/entities/debt-payment.entity';
import { InvoiceDebtEntity } from '../../pos/entities/invoice-debt.entity';
import { InvoiceItemEntity } from '../../pos/entities/invoice-item.entity';
import { InvoiceEntity } from '../../pos/entities/invoice.entity';
import { RbacModule } from '../../rbac/rbac.module';
import { ReportTemplateEntity } from '../report-core/report-template.entity';
import { CreateDebtReportTemplateHandler } from './commands/create-debt-report-template.handler';
import { DeleteDebtReportTemplateHandler } from './commands/delete-debt-report-template.handler';
import { UpdateDebtReportTemplateHandler } from './commands/update-debt-report-template.handler';
import { DebtReportController } from './debt-report.controller';
import { GetDebtReportColumnsHandler } from './queries/get-debt-report-columns.handler';
import { GetDebtReportTemplateHandler } from './queries/get-debt-report-template.handler';
import { GetReportFilterOptionsHandler } from './queries/get-report-filter-options.handler';
import { ListDebtReportTemplatesHandler } from './queries/list-debt-report-templates.handler';
import { SearchDebtReportHandler } from './queries/search-debt-report.handler';
import { ReportRegistry } from './report-definition';
import { CustomerDebtsReport } from './reports/customer-debts.report';
import { ReceivablesDetailByProductReport } from './reports/receivables-detail-by-product.report';
import { SupplierDebtsDetailByDocumentAndProductReport } from './reports/supplier-debts-detail-by-document-and-product.report';
import { SupplierDebtsReport } from './reports/supplier-debts.report';
import { DebtPeriodService } from './services/debt-period.service';

@Module({
  imports: [
    CqrsModule,
    RbacModule,
    TypeOrmModule.forFeature([
      ReportTemplateEntity,
      CustomerEntity,
      CustomerGroupEntity,
      MembershipCardEntity,
      ProviderEntity,
      SupplierGroupEntity,
      InvoiceDebtEntity,
      DebtPaymentEntity,
      ReceivableEntity,
      ReceivableSettlementEntity,
      InvoiceEntity,
      InvoiceItemEntity,
      CashReceiptEntity,
      BranchEntity,
      ItemEntity,
      ItemCategoryEntity,
      SupplierDebtEntity,
      SupplierDebtPaymentEntity,
      GoodsReceiptEntity,
      GoodsReceiptLineEntity,
      ProductEntity,
    ]),
  ],
  controllers: [DebtReportController],
  providers: [
    DebtPeriodService,
    // Report definitions (one per report type — add new ones here + to the registry factory).
    CustomerDebtsReport,
    ReceivablesDetailByProductReport,
    SupplierDebtsReport,
    SupplierDebtsDetailByDocumentAndProductReport,
    {
      provide: ReportRegistry,
      useFactory: (
        customerDebts: CustomerDebtsReport,
        receivablesDetail: ReceivablesDetailByProductReport,
        supplierDebts: SupplierDebtsReport,
        supplierDebtsDetail: SupplierDebtsDetailByDocumentAndProductReport,
      ) =>
        new ReportRegistry([
          customerDebts,
          receivablesDetail,
          supplierDebts,
          supplierDebtsDetail,
        ]),
      inject: [
        CustomerDebtsReport,
        ReceivablesDetailByProductReport,
        SupplierDebtsReport,
        SupplierDebtsDetailByDocumentAndProductReport,
      ],
    },
    // Handlers (search/columns/templates dispatch generically via ReportRegistry — no new handler per report type)
    GetDebtReportColumnsHandler,
    GetReportFilterOptionsHandler,
    SearchDebtReportHandler,
    ListDebtReportTemplatesHandler,
    GetDebtReportTemplateHandler,
    CreateDebtReportTemplateHandler,
    UpdateDebtReportTemplateHandler,
    DeleteDebtReportTemplateHandler,
  ],
})
export class DebtReportModule {}
