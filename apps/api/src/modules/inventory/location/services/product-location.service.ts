import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../item.entity';
import { ItemStorageLocationEntity } from '../../product/item-storage-location.entity';
import {
  assertProductUniformLocation,
  ProductLocationLine,
} from './product-location.util';

export { ProductLocationLine } from './product-location.util';

/**
 * Enforces the invariant "all variants of one product sit in a single location".
 * The shelf mapping stays per-variant (item_storage_locations), but writes keep
 * siblings uniform and document commands reject mixed locations for one product.
 */
@Injectable()
export class ProductLocationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Delegates to the shared pure rule; see {@link assertProductUniformLocation}. */
  assertProductUniformLocation(lines: ProductLocationLine[]): void {
    assertProductUniformLocation(lines);
  }

  /**
   * Persist the preferred shelf for a variant within a storage. When the variant
   * belongs to a product, every sibling variant is written to the same location
   * so the per-product uniform-location rule holds going forward.
   */
  async upsertUniformItemStorageLocation(
    manager: EntityManager,
    params: {
      productId?: string | null;
      itemId: string;
      storageId: string;
      locationId: string;
      actor: ActorContext;
    },
  ): Promise<void> {
    const { productId, itemId, storageId, locationId, actor } = params;

    const itemIds = productId
      ? (
          await manager.find(ItemEntity, {
            where: { productId, organizationId: actor.organizationId },
            select: { id: true },
          })
        ).map((i) => i.id)
      : [itemId];

    for (const id of itemIds) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(ItemStorageLocationEntity)
        .values({
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          itemId: id,
          storageId,
          locationId,
        })
        .orUpdate(['location_id'], ['item_id', 'storage_id'])
        .execute();
    }
  }
}
