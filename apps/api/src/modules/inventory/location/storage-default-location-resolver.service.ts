import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationEntity } from './location.entity';

@Injectable()
export class StorageDefaultLocationResolverService {
  constructor(
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
  ) {}

  /**
   * Resolve a concrete shelf for stock transfers.
   * Order: optional branch/storage fallback → "Mặc định" (isDefault) → first active non-unassigned bin.
   * Never returns the "Chưa xếp" bin.
   */
  async resolveStorageTransferLocation(
    storageId: string,
    organizationId: string,
    options: { fallbackLocationId?: string; errorLabel?: string } = {},
  ): Promise<string> {
    const { fallbackLocationId, errorLabel } = options;

    if (fallbackLocationId) {
      const fallback = await this.locationRepo.findOne({
        where: {
          id: fallbackLocationId,
          storageId,
          organizationId,
          isActive: true,
          isUnassigned: false,
        },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }

    const defaultShelf = await this.locationRepo.findOne({
      where: {
        storageId,
        organizationId,
        isActive: true,
        isUnassigned: false,
        isDefault: true,
      },
      select: { id: true },
    });
    if (defaultShelf) return defaultShelf.id;

    const firstActive = await this.locationRepo.findOne({
      where: {
        storageId,
        organizationId,
        isActive: true,
        isUnassigned: false,
      },
      order: { createdAt: 'ASC' },
      select: { id: true },
    });
    if (firstActive) return firstActive.id;

    const label = errorLabel ?? storageId;
    throw new BadRequestException(
      `Kho "${label}" chưa có vị trí lưu cụ thể — vui lòng chọn kệ hoặc tạo ít nhất một vị trí (không phải "Chưa xếp")`,
    );
  }
}
