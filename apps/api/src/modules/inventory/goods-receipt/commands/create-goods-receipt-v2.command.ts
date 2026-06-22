import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CreateGoodsReceiptV2Dto } from '../dto/create-goods-receipt-v2.dto';

export class CreateGoodsReceiptV2Command {
  constructor(
    public readonly dto: CreateGoodsReceiptV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
