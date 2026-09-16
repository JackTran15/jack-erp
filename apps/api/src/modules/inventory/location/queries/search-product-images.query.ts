import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ProductImageSearchDto } from '../dto/product-image-search.dto';

export class SearchProductImagesQuery {
  constructor(
    public readonly dto: ProductImageSearchDto,
    public readonly actor: ActorContext,
  ) {}
}
