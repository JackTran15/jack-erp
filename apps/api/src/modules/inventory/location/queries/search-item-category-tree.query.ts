import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { SearchItemCategoryTreeDto } from '../dto/search-item-category-tree.dto';

export class SearchItemCategoryTreeQuery {
  constructor(
    public readonly dto: SearchItemCategoryTreeDto,
    public readonly actor: ActorContext,
  ) {}
}
