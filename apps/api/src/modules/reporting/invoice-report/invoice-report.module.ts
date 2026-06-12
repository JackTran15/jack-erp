import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentAccountEntity } from '../../accounting/payment-accounts/payment-account.entity';
import { InvoiceEntity } from '../../pos/entities/invoice.entity';
import { InvoicePaymentEntity } from '../../pos/entities/invoice-payment.entity';
import { InvoicePromotionEntity } from '../../promotion/invoice-promotion.entity';
import { RbacModule } from '../../rbac/rbac.module';
import { CreateInvoiceReportTemplateHandler } from './commands/create-invoice-report-template.handler';
import { DeleteInvoiceReportTemplateHandler } from './commands/delete-invoice-report-template.handler';
import { UpdateInvoiceReportTemplateHandler } from './commands/update-invoice-report-template.handler';
import { InvoiceReportController } from './invoice-report.controller';
import { InvoiceReportTemplateEntity } from './invoice-report-template.entity';
import { ReportTypeEntity } from './report-type.entity';
import { ReportTypeSyncService } from './report-type-sync.service';
import { GetInvoiceReportColumnsHandler } from './queries/get-invoice-report-columns.handler';
import { GetInvoiceReportTemplateHandler } from './queries/get-invoice-report-template.handler';
import { ListInvoiceReportTemplatesHandler } from './queries/list-invoice-report-templates.handler';
import { ListInvoiceReportTypesHandler } from './queries/list-invoice-report-types.handler';
import { SearchInvoiceReportHandler } from './queries/search-invoice-report.handler';
import { ReportRegistry } from './report-definition';
import { DailySalesSummaryReport } from './reports/daily-sales-summary.report';

@Module({
  imports: [
    CqrsModule,
    RbacModule,
    TypeOrmModule.forFeature([
      InvoiceReportTemplateEntity,
      ReportTypeEntity,
      InvoiceEntity,
      InvoicePaymentEntity,
      InvoicePromotionEntity,
      PaymentAccountEntity,
    ]),
  ],
  controllers: [InvoiceReportController],
  providers: [
    // Report definitions (one per report type — add new ones here + to the registry factory).
    DailySalesSummaryReport,
    {
      provide: ReportRegistry,
      useFactory: (daily: DailySalesSummaryReport) => new ReportRegistry([daily]),
      inject: [DailySalesSummaryReport],
    },
    // Report-type catalogue sync (seeds report_types on boot)
    ReportTypeSyncService,
    // Handlers
    GetInvoiceReportColumnsHandler,
    SearchInvoiceReportHandler,
    ListInvoiceReportTypesHandler,
    ListInvoiceReportTemplatesHandler,
    GetInvoiceReportTemplateHandler,
    CreateInvoiceReportTemplateHandler,
    UpdateInvoiceReportTemplateHandler,
    DeleteInvoiceReportTemplateHandler,
  ],
})
export class InvoiceReportModule {}
