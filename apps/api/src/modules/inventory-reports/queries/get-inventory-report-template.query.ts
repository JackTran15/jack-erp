import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export class GetInventoryReportTemplateQuery {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
