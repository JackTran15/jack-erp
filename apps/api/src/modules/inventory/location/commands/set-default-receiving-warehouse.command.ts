import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

/**
 * Mark a storage as the active branch's single default receiving warehouse.
 * Any previously-default storage in the same branch is cleared in the same
 * transaction so the partial unique index never trips.
 */
export class SetDefaultReceivingWarehouseCommand {
  constructor(
    public readonly storageId: string,
    public readonly actor: ActorContext,
  ) {}
}
