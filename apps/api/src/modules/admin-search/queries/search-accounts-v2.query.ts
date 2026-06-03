import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { AccountSearchV2Dto } from '../dto/account-search-v2.dto';

export class SearchAccountsV2Query {
  constructor(
    public readonly dto: AccountSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
