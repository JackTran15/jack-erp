import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PartnerCategoryTreeRequestDto } from '../dto/partner-category-tree.dto';

export class SearchPartnerCategoriesQuery {
  constructor(
    public readonly dto: PartnerCategoryTreeRequestDto,
    public readonly actor: ActorContext,
  ) {}
}
