import { Provider, Type } from '@nestjs/common';
import { ReportDefinition } from '../report-definition';
import { CashFundPeriodService } from '../services/cash-fund-period.service';
import { CashInOutSituationReport } from './cash-in-out-situation.report';

/**
 * The one place a cash-fund report registers itself. Each `*.report.ts` adds
 * its class here; the module spreads both lists and builds the registry from
 * `CASH_FUND_REPORT_DEFINITIONS`, so adding a report never touches the module.
 * Shared services the definitions inject go in `CASH_FUND_REPORT_PROVIDERS`.
 */
export const CASH_FUND_REPORT_DEFINITIONS: Type<ReportDefinition>[] = [
  CashInOutSituationReport,
];

export const CASH_FUND_REPORT_PROVIDERS: Provider[] = [CashFundPeriodService];
