import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ExportItemDiscountLinesDto } from '../dto/item-discount-excel.dto';

export class ExportItemDiscountLinesQuery {
  constructor(
    public readonly dto: ExportItemDiscountLinesDto,
    public readonly actor: ActorContext,
  ) {}
}
