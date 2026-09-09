import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PartnerProductSearchDto } from '../dto/partner-product-search.dto';

export class SearchPartnerProductsQuery {
  constructor(
    public readonly dto: PartnerProductSearchDto,
    public readonly actor: ActorContext,
  ) {}
}
