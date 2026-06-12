import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class GetInvoiceReportColumnsQuery {
  constructor(
    public readonly reportType: string,
    public readonly actor: ActorContext,
  ) {}
}
