import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ProductSearchV2Dto } from '../dto/product-search-v2.dto';

export class SearchProductsV2Query {
  constructor(
    public readonly dto: ProductSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
