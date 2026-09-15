import { Injectable } from '@nestjs/common';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { MediaOwnerType } from './media-object.entity';

export type MediaOwnerReader = (ownerId: string, actor: ActorContext) => Promise<boolean>;

/**
 * Reverse-dependency registry for ADR-06 (03-logical-design.md > Approach):
 * each document module registers, in its own `onModuleInit`, the same read
 * check its own detail endpoint already uses, so `MediaDownloadService` never
 * imports inventory/accounting services directly. A duplicate registration
 * throws immediately at boot rather than silently overwriting the first
 * reader.
 */
@Injectable()
export class MediaOwnerReaderRegistry {
  private readonly readers = new Map<MediaOwnerType, MediaOwnerReader>();

  register(ownerType: MediaOwnerType, reader: MediaOwnerReader): void {
    if (this.readers.has(ownerType)) {
      throw new Error(`MediaOwnerReaderRegistry: a reader is already registered for ownerType "${ownerType}"`);
    }
    this.readers.set(ownerType, reader);
  }

  get(ownerType: MediaOwnerType): MediaOwnerReader | undefined {
    return this.readers.get(ownerType);
  }
}
