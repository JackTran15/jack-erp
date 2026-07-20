import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class ListProfitReportTemplatesQuery {
  constructor(
    public readonly actor: ActorContext,
    public readonly reportType?: string,
  ) {}
}
