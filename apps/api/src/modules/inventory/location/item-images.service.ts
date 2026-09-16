import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MediaLinkService } from '../../media/media-link.service';
import { MediaOwnerType } from '../../media/media-object.entity';
import { MediaException } from '../../media/media.exception';
import {
  SetItemImagesAssignmentDto,
  SetItemImagesResponseDto,
} from './dto/set-item-images.dto';

interface OwnerRow {
  id: string;
  owner_type: 'PRODUCT' | 'ITEM';
  code: string;
}

/**
 * Bulk image replacement for the goods list (ADR-02). Mirrors the
 * `setActiveStatus` shape: the caller sends grid row ids, the service works
 * out what each one stands for and reports per-row outcomes instead of
 * failing the whole batch.
 *
 * Owner type is never taken from the body — a products.id becomes a PRODUCT
 * owner, an items.id with no product becomes an ITEM owner, and anything
 * else (including a variant's items.id) is `OWNER_NOT_FOUND`. Every
 * assignment runs `syncOwner` in its own transaction so one media failure
 * leaves the other rows committed.
 */
@Injectable()
export class ItemImagesService {
  private readonly logger = new Logger(ItemImagesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mediaLink: MediaLinkService,
  ) {}

  async setImages(
    assignments: SetItemImagesAssignmentDto[],
    actor: ActorContext,
  ): Promise<SetItemImagesResponseDto> {
    const owners = await this.resolveOwners(
      assignments.map((a) => a.id),
      actor.organizationId,
    );

    const updated: SetItemImagesResponseDto['updated'] = [];
    const failed: SetItemImagesResponseDto['failed'] = [];

    // In body order: a duplicated id is applied twice and the later one wins,
    // which is safe because syncOwner is a full replace.
    for (const assignment of assignments) {
      const owner = owners.get(assignment.id.toLowerCase());
      if (!owner) {
        failed.push({ id: assignment.id, code: null, reason: 'OWNER_NOT_FOUND' });
        continue;
      }
      try {
        const ids = await this.dataSource.transaction((manager) =>
          this.mediaLink.syncOwner(
            owner.ownerType,
            owner.id,
            assignment.imageIds,
            actor,
            manager,
          ),
        );
        updated.push({ id: owner.id, code: owner.code, imageCount: ids.length });
      } catch (err) {
        // Only media outcomes are per-row results; anything else is a system
        // failure and must surface as one.
        if (!(err instanceof MediaException)) throw err;
        failed.push({ id: owner.id, code: owner.code, reason: err.code });
      }
    }

    this.logger.log(
      `set-images org=${actor.organizationId} updated=${updated.length} failed=${failed.length}`,
    );
    return { updated, failed };
  }

  /**
   * One query for the whole batch. Both `organization_id` columns are varchar
   * (only `media_objects.organization_id` is uuid), so `$1` stays uncast as in
   * `setActiveStatus`; `$2` is cast because `id` is uuid on both tables.
   */
  private async resolveOwners(
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, { id: string; ownerType: MediaOwnerType; code: string }>> {
    const rows = await this.dataSource.query<OwnerRow[]>(
      `SELECT id, 'PRODUCT' AS owner_type, code FROM products
        WHERE organization_id = $1 AND id = ANY($2::uuid[])
       UNION ALL
       SELECT id, 'ITEM' AS owner_type, code FROM items
        WHERE organization_id = $1 AND product_id IS NULL AND id = ANY($2::uuid[])`,
      [organizationId, ids],
    );
    const owners = new Map<string, { id: string; ownerType: MediaOwnerType; code: string }>();
    for (const row of rows) {
      owners.set(row.id.toLowerCase(), {
        id: row.id,
        ownerType:
          row.owner_type === 'PRODUCT' ? MediaOwnerType.PRODUCT : MediaOwnerType.ITEM,
        code: row.code,
      });
    }
    return owners;
  }
}
