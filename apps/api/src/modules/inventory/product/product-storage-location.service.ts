import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductStorageLocationEntity } from './product-storage-location.entity';
import { ItemEntity } from '../location/item.entity';
import { LocationEntity } from '../location/location.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

@Injectable()
export class ProductStorageLocationService {
  private readonly logger = new Logger(ProductStorageLocationService.name);

  constructor(
    @InjectRepository(ProductStorageLocationEntity)
    private readonly pslRepo: Repository<ProductStorageLocationEntity>,
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
  ) {}

  /**
   * Ensures a product has a preferred/default location for a storage.
   * Called before any stock posting that involves a location.
   *
   * 1. If item has no productId → skip (legacy item, no constraint)
   * 2. Look up existing mapping for (productId, storageId)
   * 3. If mapping exists → keep it unchanged as the deterministic preferred shelf
   * 4. If no mapping exists → use the posted location as the initial preferred shelf
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
    const item = await this.itemRepo.findOne({
      where: { id: itemId, organizationId: actor.organizationId },
    });
    if (!item?.productId) return;

    // The database constraint is one mapping per product + storage. Legacy rows
    // may have branch_id NULL, so branch access is enforced through locations.
    const existing = await this.pslRepo.findOne({
      where: {
        productId: item.productId,
        storageId,
        organizationId: actor.organizationId,
      },
    });

    if (existing) return;

    const mapping = this.pslRepo.create({
      productId: item.productId,
      storageId,
      locationId,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    await this.pslRepo.save(mapping);

    this.logger.log(
      `Auto-assigned product ${item.productId} → location ${locationId} in storage ${storageId}`,
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
    // resting there must never establish/conflict with a product's preferred
    // shelf. Receipts into "Chưa xếp" therefore skip the PSL binding entirely.
    if (location.isUnassigned) return;

    await this.validateAndAssign(itemId, location.storageId, locationId, actor);
  }

  /**
   * Move (or create) a product's preferred shelf for an item, by itemId.
   * Resolves the item's productId and the location's storageId, then upserts the
   * mapping via {@link setLocation} (no "đã gán vị trí khác" throw — used by the
   * "Xếp vị trí" flow which deliberately changes the preferred shelf).
   * No-op for legacy items without a productId.
   */
  async setLocationByItem(
    itemId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<void> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, organizationId: actor.organizationId },
    });
    if (!item?.productId) return;

    const location = await this.locationRepo.findOne({
      where: {
        id: locationId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
      },
    });
    if (!location) return;

    await this.setLocation(item.productId, location.storageId, locationId, actor);
  }

  async listByProduct(
    productId: string,
    actor: ActorContext,
  ): Promise<ProductStorageLocationEntity[]> {
    // Include legacy branch_id NULL rows; callers validate the resolved location.
    return this.pslRepo.find({
      where: {
        productId,
        organizationId: actor.organizationId,
      },
    });
  }

  /**
   * Resolve an item's arranged bin ("đã sắp") in a storage: item → productId →
   * ProductStorageLocation(productId, storageId) → location. Null when the item
   * has no product or no assignment yet. Used by the goods-receipt form to
   * auto-fill Vị trí when a Kho is picked.
   */
  async resolveAssignedLocation(
    itemId: string,
    storageId: string,
    organizationId: string,
  ): Promise<{ locationId: string; code: string } | null> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, organizationId },
    });
    if (!item?.productId) return null;
    const mapping = await this.pslRepo.findOne({
      where: { productId: item.productId, storageId, organizationId },
    });
    if (!mapping) return null;
    const location = await this.locationRepo.findOne({
      where: { id: mapping.locationId, organizationId },
    });
    return location ? { locationId: location.id, code: location.code } : null;
  }

  async setLocation(
    productId: string,
    storageId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<ProductStorageLocationEntity> {
    // Match the database uniqueness key and reuse legacy branch_id NULL rows.
    const existing = await this.pslRepo.findOne({
      where: {
        productId,
        storageId,
        organizationId: actor.organizationId,
      },
    });

    if (existing) {
      existing.locationId = locationId;
      return this.pslRepo.save(existing);
    }

    const mapping = this.pslRepo.create({
      productId,
      storageId,
      locationId,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    return this.pslRepo.save(mapping);
  }
}
