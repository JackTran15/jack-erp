import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StorageSearchV2Dto } from '../dto/storage-search-v2.dto';

export class SearchStoragesV2Query {
  constructor(
    public readonly dto: StorageSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
