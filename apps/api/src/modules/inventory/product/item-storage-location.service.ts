import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemStorageLocationEntity } from './item-storage-location.entity';
import { LocationEntity } from '../location/location.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

@Injectable()
export class ItemStorageLocationService {
  private readonly logger = new Logger(ItemStorageLocationService.name);

  constructor(
    @InjectRepository(ItemStorageLocationEntity)
    private readonly islRepo: Repository<ItemStorageLocationEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
  ) {}

  /**
   * Ensures an item (variant) has a preferred/default location for a storage.
   * Called before any stock posting that involves a location.
   *
   * 1. Look up existing mapping for (itemId, storageId)
   * 2. If mapping exists → keep it unchanged as the deterministic preferred shelf
   * 3. If no mapping exists → use the posted location as the initial preferred shelf
   *
   * Stock may exist at multiple locations in the same storage. Actual stock is
   * tracked by the ledger/balance using itemId + locationId; this mapping only
   * supplies a default location for entry forms.
   */
  async validateAndAssign(
    itemId: string,
    storageId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<void> {
    // The database constraint is one mapping per item + storage. Legacy rows
    // may have branch_id NULL, so branch access is enforced through locations.
    const existing = await this.islRepo.findOne({
      where: {
        itemId,
        storageId,
        organizationId: actor.organizationId,
      },
    });

    if (existing) return;

    const mapping = this.islRepo.create({
      itemId,
      storageId,
      locationId,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    await this.islRepo.save(mapping);

    this.logger.log(
      `Auto-assigned item ${itemId} → location ${locationId} in storage ${storageId}`,
    );
  }

  /**
   * Resolves storageId from a locationId, then delegates to validateAndAssign.
   * Convenience wrapper used by the stock ledger service.
   */
  async validateAndAssignByLocation(
    itemId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<void> {
    const location = await this.locationRepo.findOne({
      where: {
        id: locationId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
      },
    });
    if (!location) return;

    // The virtual "Chưa xếp" (unassigned) location is not a real shelf — stock
    // resting there must never establish/conflict with an item's preferred
    // shelf. Receipts into "Chưa xếp" therefore skip the binding entirely.
    if (location.isUnassigned) return;

    await this.validateAndAssign(itemId, location.storageId, locationId, actor);
  }

  /**
   * Move (or create) an item's preferred shelf, by itemId. Resolves the
   * location's storageId, then upserts the mapping via {@link setLocation} (no
   * "đã gán vị trí khác" throw — used by the "Xếp vị trí" flow which deliberately
   * changes the preferred shelf).
   */
  async setLocationByItem(
    itemId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<void> {
    const location = await this.locationRepo.findOne({
      where: {
        id: locationId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
      },
    });
    if (!location) return;

    await this.setLocation(itemId, location.storageId, locationId, actor);
  }

  async listByItem(
    itemId: string,
    actor: ActorContext,
  ): Promise<ItemStorageLocationEntity[]> {
    // Include legacy branch_id NULL rows; callers validate the resolved location.
    return this.islRepo.find({
      where: {
        itemId,
        organizationId: actor.organizationId,
      },
    });
  }

  /**
   * Resolve an item's arranged bin ("đã sắp") in a storage:
   * ItemStorageLocation(itemId, storageId) → location. Null when the item has no
   * assignment yet. Used by the goods-receipt form to auto-fill Vị trí when a
   * Kho is picked.
   */
  async resolveAssignedLocation(
    itemId: string,
    storageId: string,
    organizationId: string,
  ): Promise<{ locationId: string; code: string } | null> {
    const mapping = await this.islRepo.findOne({
      where: { itemId, storageId, organizationId },
    });
    if (!mapping) return null;
    const location = await this.locationRepo.findOne({
      where: { id: mapping.locationId, organizationId },
    });
    return location ? { locationId: location.id, code: location.code } : null;
  }

  async setLocation(
    itemId: string,
    storageId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<ItemStorageLocationEntity> {
    // Match the database uniqueness key and reuse legacy branch_id NULL rows.
    const existing = await this.islRepo.findOne({
      where: {
        itemId,
        storageId,
        organizationId: actor.organizationId,
      },
    });

    if (existing) {
      existing.locationId = locationId;
      return this.islRepo.save(existing);
    }

    const mapping = this.islRepo.create({
      itemId,
      storageId,
      locationId,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    return this.islRepo.save(mapping);
  }

  /**
   * Remove the preferred-shelf mapping only when it still points at the shelf
   * being cleared. A mapping changed by another flow must not be deleted.
   */
  async clearLocation(
    itemId: string,
    storageId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.islRepo.delete({
      itemId,
      storageId,
      locationId,
      organizationId: actor.organizationId,
    });
  }
}
