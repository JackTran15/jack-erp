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
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item?.productId) return;

    const existing = await this.pslRepo.findOne({
      where: { productId: item.productId, storageId },
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
      where: { id: locationId },
    });
    if (!location) return;

    await this.validateAndAssign(itemId, location.storageId, locationId, actor);
  }

  async listByProduct(
    productId: string,
    _actor: ActorContext,
  ): Promise<ProductStorageLocationEntity[]> {
    return this.pslRepo.find({ where: { productId } });
  }

  async setLocation(
    productId: string,
    storageId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<ProductStorageLocationEntity> {
    const existing = await this.pslRepo.findOne({
      where: { productId, storageId },
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
