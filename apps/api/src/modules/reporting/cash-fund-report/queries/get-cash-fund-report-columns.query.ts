import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class GetCashFundReportColumnsQuery {
  constructor(
    public readonly reportType: string,
    public readonly actor: ActorContext,
  ) {}
}
