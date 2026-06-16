import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class DeleteInvoiceReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
