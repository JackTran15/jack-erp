import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class GetProfitReportTemplateQuery {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
