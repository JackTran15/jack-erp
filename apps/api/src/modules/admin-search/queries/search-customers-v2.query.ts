import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CustomerSearchV2Dto } from '../dto/customer-search-v2.dto';

export class SearchCustomersV2Query {
  constructor(
    public readonly dto: CustomerSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
