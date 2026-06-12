import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class GetInvoiceReportTemplateQuery {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
