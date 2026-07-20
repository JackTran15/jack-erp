import { ReportGroupBy } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { StoreScopeDto } from '../dto/store-scope.dto';

export class GetInvoiceReportColumnsQuery {
  constructor(
    public readonly reportType: string,
    public readonly actor: ActorContext,
    /** Only used by revenue-by-item ("Thống kê theo": item | parent | group). */
    public readonly statBy?: ReportGroupBy,
    /** Only used by revenue-by-item — gates the location columns on a single resolved store. */
    public readonly store?: StoreScopeDto,
    public readonly branchId?: string,
  ) {}
}
