import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InvoiceReportSearchDto } from '../dto/invoice-report-search.dto';

export class SearchInvoiceReportQuery {
  constructor(
    public readonly dto: InvoiceReportSearchDto,
    public readonly actor: ActorContext,
  ) {}
}
