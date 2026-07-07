import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export class DeleteInventoryReportTemplateCommand {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
