import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class GetDebtReportColumnsQuery {
  constructor(
    public readonly reportType: string,
    public readonly actor: ActorContext,
    /** Only used by supplier-debts-detail-by-document-and-product ("Thống kê theo"). */
    public readonly groupBy?: 'item' | 'productTemplate',
  ) {}
}
