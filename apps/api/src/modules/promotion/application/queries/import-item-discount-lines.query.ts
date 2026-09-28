import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ItemDiscountExcelMethod } from '../dto/item-discount-excel.dto';

export class ImportItemDiscountLinesQuery {
  constructor(
    public readonly buffer: Buffer,
    public readonly method: ItemDiscountExcelMethod,
    public readonly actor: ActorContext,
  ) {}
}
