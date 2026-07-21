import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DepositReconSearchV2Dto } from '../dto/deposit-recon-search-v2.dto';

export class SearchDepositReconV2Query {
  constructor(
    public readonly dto: DepositReconSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
