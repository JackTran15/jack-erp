import { ReportGroupBy } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class GetProfitReportColumnsQuery {
  constructor(
    public readonly reportType: string,
    public readonly actor: ActorContext,
    /** Only used by profit-by-item ("Thống kê theo": item | parent | group). */
    public readonly statBy?: ReportGroupBy,
  ) {}
}
