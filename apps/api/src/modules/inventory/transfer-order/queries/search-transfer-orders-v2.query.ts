import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { TransferOrderSearchV2Dto } from '../dto/transfer-order-search-v2.dto';

export class SearchTransferOrdersV2Query {
  constructor(
    public readonly dto: TransferOrderSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
