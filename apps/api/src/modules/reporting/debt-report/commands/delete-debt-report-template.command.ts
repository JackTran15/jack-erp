import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class DeleteDebtReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
