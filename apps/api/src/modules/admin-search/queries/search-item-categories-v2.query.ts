import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemCategorySearchV2Dto } from '../dto/item-category-search-v2.dto';

export class SearchItemCategoriesV2Query {
  constructor(
    public readonly dto: ItemCategorySearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
