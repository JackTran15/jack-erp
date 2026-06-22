import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CreateStockTransferV2Dto } from '../dto/create-stock-transfer-v2.dto';

export class CreateStockTransferV2Command {
  constructor(
    public readonly dto: CreateStockTransferV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
