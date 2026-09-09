import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PosCatalogSearchQueryDto } from '../dto/pos-catalog-search.query.dto';

export class SearchPosCatalogQuery {
  constructor(
    public readonly branchId: string,
    public readonly dto: PosCatalogSearchQueryDto,
    public readonly actor: ActorContext,
  ) {}
}
