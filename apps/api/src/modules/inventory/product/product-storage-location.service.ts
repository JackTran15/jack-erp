import { Injectable, BadRequestException, Logger } from '@nestjs/common';
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
   * Validates and auto-assigns product → location mapping for a storage.
   * Called before any stock posting that involves a location.
   *
   * 1. If item has no productId → skip (legacy item, no constraint)
   * 2. Look up existing mapping for (productId, storageId)
   * 3. If mapping exists and locationId matches → OK
   * 4. If mapping exists and locationId differs → throw BadRequestException
   * 5. If no mapping exists → auto-insert the mapping
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

    const existing = await this.pslRepo.findOne({
      where: {
        productId: item.productId,
        storageId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
      },
    });

    if (existing) {
      if (existing.locationId === locationId) return;

      throw new BadRequestException(
        'Sản phẩm này đã được gán vị trí khác trong kho. Vui lòng sử dụng vị trí đã cấu hình.',
      );
    }

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
    return this.pslRepo.find({
      where: {
        productId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
      },
    });
  }

  async setLocation(
    productId: string,
    storageId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<ProductStorageLocationEntity> {
    const existing = await this.pslRepo.findOne({
      where: {
        productId,
        storageId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
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
