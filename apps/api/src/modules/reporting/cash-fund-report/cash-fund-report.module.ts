import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashPaymentLineEntity } from '../../accounting/cash-vouchers/cash-payments/cash-payment-line.entity';
import { CashPaymentEntity } from '../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptLineEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt-line.entity';
import { CashReceiptEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashVoucherCategoryEntity } from '../../accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';
import { DepositAccountEntity } from '../../accounting/deposit/deposit-account.entity';
import { BankPaymentLineEntity } from '../../accounting/deposit-vouchers/bank-payments/bank-payment-line.entity';
import { BankPaymentEntity } from '../../accounting/deposit-vouchers/bank-payments/bank-payment.entity';
import { BankReceiptLineEntity } from '../../accounting/deposit-vouchers/bank-receipts/bank-receipt-line.entity';
import { BankReceiptEntity } from '../../accounting/deposit-vouchers/bank-receipts/bank-receipt.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { EmployeeProfileEntity } from '../../rbac/employee/employee-profile.entity';
import { RbacModule } from '../../rbac/rbac.module';
import { ReportExportService } from '../report-core/report-export.service';
import { ReportPermissionGuard } from '../report-core/report-permission.guard';
import { ReportTemplateEntity } from '../report-core/report-template.entity';
import { CashFundReportController } from './cash-fund-report.controller';
import { CreateCashFundReportTemplateHandler } from './commands/create-cash-fund-report-template.handler';
import { DeleteCashFundReportTemplateHandler } from './commands/delete-cash-fund-report-template.handler';
import { UpdateCashFundReportTemplateHandler } from './commands/update-cash-fund-report-template.handler';
import { GetCashFundReportColumnsHandler } from './queries/get-cash-fund-report-columns.handler';
import { GetCashFundReportDocumentHandler } from './queries/get-cash-fund-report-document.handler';
import { GetCashFundReportTemplateHandler } from './queries/get-cash-fund-report-template.handler';
import { GetReportFilterOptionsHandler } from './queries/get-report-filter-options.handler';
import { ListCashFundReportTemplatesHandler } from './queries/list-cash-fund-report-templates.handler';
import { SearchCashFundReportHandler } from './queries/search-cash-fund-report.handler';
import { ReportDefinition, ReportRegistry } from './report-definition';
import { CASH_FUND_REPORT_DEFINITIONS, CASH_FUND_REPORT_PROVIDERS } from './reports';

/**
 * The `cash` report domain (Quỹ tiền). Same route set and same core as
 * debt-report; the five definitions and their shared services are listed in
 * `reports/index.ts`, so a new report is one line there and nothing here.
 */
@Module({
  imports: [
    CqrsModule,
    RbacModule,
    TypeOrmModule.forFeature([
      ReportTemplateEntity,
      BranchEntity,
      EmployeeProfileEntity,
      CashReceiptEntity,
      CashReceiptLineEntity,
      CashPaymentEntity,
      CashPaymentLineEntity,
      BankReceiptEntity,
      BankReceiptLineEntity,
      BankPaymentEntity,
      BankPaymentLineEntity,
      CashVoucherCategoryEntity,
      DepositAccountEntity,
    ]),
  ],
  controllers: [CashFundReportController],
  providers: [
    ReportExportService,
    ReportPermissionGuard,
    ...CASH_FUND_REPORT_PROVIDERS,
    ...CASH_FUND_REPORT_DEFINITIONS,
    {
      provide: ReportRegistry,
      useFactory: (...definitions: ReportDefinition[]) => new ReportRegistry(definitions),
      inject: CASH_FUND_REPORT_DEFINITIONS,
    },
    // Handlers (search/columns/filter-options/templates/export dispatch generically via ReportRegistry).
    GetCashFundReportColumnsHandler,
    GetReportFilterOptionsHandler,
    SearchCashFundReportHandler,
    GetCashFundReportDocumentHandler,
    ListCashFundReportTemplatesHandler,
    GetCashFundReportTemplateHandler,
    CreateCashFundReportTemplateHandler,
    UpdateCashFundReportTemplateHandler,
    DeleteCashFundReportTemplateHandler,
  ],
})
export class CashFundReportModule {}
