import {
  ReportDefinition as CoreReportDefinition,
  ReportRegistry as CoreReportRegistry,
} from '../report-core/report-definition';
import { InvoiceReportSearchDto } from './dto/invoice-report-search.dto';

/**
 * Invoice-domain specialization of the generic report core. The names
 * `ReportDefinition` / `ReportRegistry` are kept so existing invoice report
 * implementations, providers and specs stay untouched.
 */
export type ReportDefinition = CoreReportDefinition<InvoiceReportSearchDto>;

/** Indexes the registered invoice report definitions by key (DI class token). */
export class ReportRegistry extends CoreReportRegistry<ReportDefinition> {}
