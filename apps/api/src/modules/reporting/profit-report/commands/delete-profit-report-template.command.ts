import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class DeleteProfitReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
