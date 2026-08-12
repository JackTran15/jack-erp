import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
    const targetLocation = await this.findLocationInStorage(
      locationId,
      storageId,
      actor,
    );
    if (!targetLocation) {
      throw new BadRequestException(
        'Vị trí không thuộc kho đang chọn hoặc không thuộc chi nhánh hiện tại',
      );
    }

    // The database constraint is one mapping per item + storage. Legacy rows
    // may have branch_id NULL, so branch access is enforced through locations.
    const existing = await this.islRepo.findOne({
      where: {
        itemId,
        storageId,
        organizationId: actor.organizationId,
      },
    });

    if (existing) {
      const existingLocation = await this.findLocationInStorage(
        existing.locationId,
        storageId,
        actor,
      );
      if (existingLocation) return;

      existing.locationId = targetLocation.id;
      await this.islRepo.save(existing);
      this.logger.warn(
        `Repaired item ${itemId} preferred location for storage ${storageId}: ${locationId}`,
      );
      return;
    }

    const mapping = this.islRepo.create({
      itemId,
      storageId,
      locationId: targetLocation.id,
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
        ...(actor.branchId ? { storage: { branchId: actor.branchId } } : {}),
      },
      relations: { storage: true },
    });
    if (!location) return;

    // The virtual "Chưa xếp" (unassigned) location is not a real shelf — stock
    // resting there must never establish/conflict with an item's preferred
    // shelf. Receipts into "Chưa xếp" therefore skip the binding entirely.
    if (location.isUnassigned) return;

    await this.validateAndAssign(itemId, location.storageId, locationId, actor);
  }

  /**
   * Batched equivalent of calling {@link validateAndAssignByLocation} once per
   * movement — same end-state, but every read/write is done once for the whole
   * batch instead of once per movement. Used by
   * `StockLedgerService.recordBatchMovements` for large imports.
   */
  async validateAndAssignBatch(
    items: { itemId: string; locationId: string }[],
    actor: ActorContext,
  ): Promise<void> {
    if (items.length === 0) return;

    // Resolve every distinct target location once (same scoping as validateAndAssignByLocation).
    const locationIds = [...new Set(items.map((i) => i.locationId))];
    const locations = await this.locationRepo.find({
      where: {
        id: In(locationIds),
        organizationId: actor.organizationId,
        ...(actor.branchId ? { storage: { branchId: actor.branchId } } : {}),
      },
      relations: { storage: true },
    });
    const locationsById = new Map(locations.map((l) => [l.id, l]));

    // Same rules as validateAndAssignByLocation: an unresolved or "Chưa xếp"
    // location is skipped, not thrown. The mapping's uniqueness key is
    // (itemId, storageId) — not itemId alone — so an item spanning two
    // storages in one batch gets a mapping resolved per storage; within the
    // same storage, first occurrence wins, matching the old sequential order.
    const toAssign = new Map<
      string,
      { itemId: string; storageId: string; locationId: string }
    >();
    for (const { itemId, locationId } of items) {
      const location = locationsById.get(locationId);
      if (!location || location.isUnassigned) continue;
      const key = `${itemId}:${location.storageId}`;
      if (!toAssign.has(key)) {
        toAssign.set(key, { itemId, storageId: location.storageId, locationId });
      }
    }
    if (toAssign.size === 0) return;

    // Which of these (item, storage) pairs already have a preferred-shelf mapping?
    const pairs = [...toAssign.values()];
    const existing = await this.islRepo.find({
      where: pairs.map((p) => ({
        itemId: p.itemId,
        storageId: p.storageId,
        organizationId: actor.organizationId,
      })),
    });
    const existingByKey = new Map(
      existing.map((e) => [`${e.itemId}:${e.storageId}`, e]),
    );

    // Bulk-insert the missing mappings; a concurrent request racing us on the
    // same (item, storage) pair loses safely via ON CONFLICT DO NOTHING.
    const toInsert = pairs.filter(
      (p) => !existingByKey.has(`${p.itemId}:${p.storageId}`),
    );
    if (toInsert.length > 0) {
      await this.islRepo
        .createQueryBuilder()
        .insert()
        .values(
          toInsert.map((p) => ({
            itemId: p.itemId,
            storageId: p.storageId,
            locationId: p.locationId,
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
          })),
        )
        .orIgnore()
        .execute();
    }

    // Rare "repair" case: an existing mapping's location may no longer resolve
    // (deleted, reassigned to a different storage, or out of org/branch scope)
    // — resolve just those extra locations, then compare.
    if (existing.length > 0) {
      const unknownLocationIds = [
        ...new Set(
          existing
            .map((e) => e.locationId)
            .filter((id) => !locationsById.has(id)),
        ),
      ];
      if (unknownLocationIds.length > 0) {
        const extraLocations = await this.locationRepo.find({
          where: {
            id: In(unknownLocationIds),
            organizationId: actor.organizationId,
            ...(actor.branchId ? { storage: { branchId: actor.branchId } } : {}),
          },
          relations: { storage: true },
        });
        for (const loc of extraLocations) locationsById.set(loc.id, loc);
      }

      for (const existingRow of existing) {
        const currentLocation = locationsById.get(existingRow.locationId);
        const stillValid =
          !!currentLocation && currentLocation.storageId === existingRow.storageId;
        if (stillValid) continue;

        const target = toAssign.get(`${existingRow.itemId}:${existingRow.storageId}`);
        if (!target) continue;
        existingRow.locationId = target.locationId;
        await this.islRepo.save(existingRow);
        this.logger.warn(
          `Repaired item ${existingRow.itemId} preferred location for storage ${existingRow.storageId}: ${target.locationId}`,
        );
      }
    }
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
    // Location untracked (isActive=false) is not returned; the user must pick a new shelf.
    const location = await this.locationRepo.findOne({
      where: { id: mapping.locationId, storageId, organizationId, isActive: true },
    });
    return location ? { locationId: location.id, code: location.code } : null;
  }

  async setLocation(
    itemId: string,
    storageId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<ItemStorageLocationEntity> {
    const targetLocation = await this.findLocationInStorage(
      locationId,
      storageId,
      actor,
    );
    if (!targetLocation) {
      throw new BadRequestException(
        'Vị trí không thuộc kho đang chọn hoặc không thuộc chi nhánh hiện tại',
      );
    }

    // Match the database uniqueness key and reuse legacy branch_id NULL rows.
    const existing = await this.islRepo.findOne({
      where: {
        itemId,
        storageId,
        organizationId: actor.organizationId,
      },
    });

    if (existing) {
      existing.locationId = targetLocation.id;
      return this.islRepo.save(existing);
    }

    const mapping = this.islRepo.create({
      itemId,
      storageId,
      locationId: targetLocation.id,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    return this.islRepo.save(mapping);
  }

  private findLocationInStorage(
    locationId: string,
    storageId: string,
    actor: ActorContext,
  ): Promise<LocationEntity | null> {
    return this.locationRepo.findOne({
      where: {
        id: locationId,
        storageId,
        organizationId: actor.organizationId,
        ...(actor.branchId ? { storage: { branchId: actor.branchId } } : {}),
      },
      relations: { storage: true },
    });
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
