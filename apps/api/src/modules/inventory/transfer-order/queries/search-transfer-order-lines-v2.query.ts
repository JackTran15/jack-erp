import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { TransferOrderLineSearchV2Dto } from '../dto/transfer-order-line-search-v2.dto';

export class SearchTransferOrderLinesV2Query {
  constructor(
    public readonly transferOrderId: string,
    public readonly dto: TransferOrderLineSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
