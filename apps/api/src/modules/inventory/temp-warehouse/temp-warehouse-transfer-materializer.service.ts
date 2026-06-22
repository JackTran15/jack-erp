import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as isUuid } from 'uuid';
import { TempWarehouseDirection, TempWarehouseTransferKind } from '@erp/shared-interfaces';
import type { TempWarehouseTransferRequestedPayload } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { LocationEntity } from '../location/location.entity';
import { InventoryLocationStockService } from '../location/inventory-location-stock.service';
import { StorageDefaultLocationResolverService } from '../location/storage-default-location-resolver.service';
import { BranchScopedTransferInput } from '../transfer/stock-transfer.service';
import { BranchLocationResolverService } from './branch-location-resolver.service';

@Injectable()
export class TempWarehouseTransferMaterializerService {
  constructor(
    private readonly branchLocationResolver: BranchLocationResolverService,
    private readonly storageDefaultLocationResolver: StorageDefaultLocationResolverService,
    private readonly inventoryLocationStockService: InventoryLocationStockService,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
  ) {}

  async buildBranchScopedTransfer(
    payload: TempWarehouseTransferRequestedPayload,
    actor: ActorContext,
  ): Promise<BranchScopedTransferInput> {
    const branchLocs = await this.branchLocationResolver.resolve(
      payload.branchId,
      payload.organizationId,
    );
    const isW2s =
      payload.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
    const sourceStorageId = isW2s
      ? branchLocs.warehouseStorageId
      : branchLocs.showroomStorageId;
    const destinationStorageId = isW2s
      ? branchLocs.showroomStorageId
      : branchLocs.warehouseStorageId;
    const sourceFallbackLocationId = isW2s
      ? branchLocs.warehouseLocationId
      : branchLocs.showroomLocationId;
    const destinationFallbackLocationId = isW2s
      ? branchLocs.showroomLocationId
      : branchLocs.warehouseLocationId;

    const lines: BranchScopedTransferInput['lines'] = [];
    for (const [idx, pl] of payload.lines.entries()) {
      const sourceLocationId = await this.resolveShelfLocationId(
        idx,
        pl.itemId,
        sourceStorageId,
        pl.sourceLocationId,
        payload.organizationId,
        sourceFallbackLocationId,
        actor,
        'xuất',
      );
      const destinationLocationId = await this.resolveShelfLocationId(
        idx,
        pl.itemId,
        destinationStorageId,
        undefined,
        payload.organizationId,
        destinationFallbackLocationId,
        actor,
        'nhập',
      );

      if (sourceLocationId === destinationLocationId) {
        throw new BadRequestException(
          `Dòng ${idx + 1}: vị trí xuất và vị trí nhập phải khác nhau`,
        );
      }

      lines.push({
        itemId: pl.itemId,
        quantity: pl.quantity,
        sourceStorageId,
        destinationStorageId,
        sourceLocationId,
        destinationLocationId,
      });
    }

    return {
      notes:
        payload.notes ??
        (payload.kind === TempWarehouseTransferKind.PARTIAL
          ? `Partial from temp warehouse session ${payload.sessionId}`
          : `From temp warehouse session ${payload.sessionId}`),
      lines,
    };
  }

  /**
   * Prefer the shelf chosen on POS; then the item's preferred/default shelf in
   * the storage; then a concrete branch/storage shelf. Never uses "Chưa xếp".
   */
  private async resolveShelfLocationId(
    lineIdx: number,
    itemId: string,
    storageId: string,
    explicitLocationId: string | undefined,
    organizationId: string,
    fallbackLocationId: string,
    actor: ActorContext,
    role: 'xuất' | 'nhập',
  ): Promise<string> {
    if (explicitLocationId && isUuid(explicitLocationId)) {
      const explicit = await this.locationRepo.findOne({
        where: {
          id: explicitLocationId,
          organizationId: actor.organizationId,
          storageId,
          isActive: true,
        },
        select: { id: true, isUnassigned: true },
      });
      if (explicit) {
        if (explicit.isUnassigned) {
          throw new BadRequestException(
            `Dòng ${lineIdx + 1}: không thể chuyển từ vị trí "Chưa xếp"`,
          );
        }
        return explicit.id;
      }
    }

    const preferred = await this.inventoryLocationStockService.getPreferredShelf(
      itemId,
      storageId,
      actor,
    );
    if (preferred) {
      await this.assertTransferableLocation(
        preferred.id,
        organizationId,
        lineIdx,
        role,
      );
      return preferred.id;
    }

    const locationId =
      await this.storageDefaultLocationResolver.resolveStorageTransferLocation(
        storageId,
        organizationId,
        { fallbackLocationId },
      );
    await this.assertTransferableLocation(
      locationId,
      organizationId,
      lineIdx,
      role,
    );
    return locationId;
  }

  private async assertTransferableLocation(
    locationId: string,
    organizationId: string,
    lineIdx: number,
    role: 'xuất' | 'nhập',
  ): Promise<void> {
    const loc = await this.locationRepo.findOne({
      where: { id: locationId, organizationId },
      select: { id: true, isUnassigned: true },
    });
    if (!loc || loc.isUnassigned) {
      throw new BadRequestException(
        `Dòng ${lineIdx + 1}: vị trí ${role} không hợp lệ — cần chọn kệ cụ thể, không dùng "Chưa xếp"`,
      );
    }
  }
}
