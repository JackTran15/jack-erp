import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageEntity } from '../location/storage.entity';
import { ShowroomEntity } from '../location/showroom.entity';
import { LocationEntity } from '../location/location.entity';

export interface ResolvedBranchLocations {
  warehouseStorageId: string;
  warehouseLocationId: string;
  showroomStorageId: string;
  showroomLocationId: string;
}

@Injectable()
export class BranchLocationResolverService {
  constructor(
    @InjectRepository(StorageEntity)
    private readonly storageRepo: Repository<StorageEntity>,
    @InjectRepository(ShowroomEntity)
    private readonly showroomRepo: Repository<ShowroomEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
  ) {}

  async resolve(branchId: string, organizationId: string): Promise<ResolvedBranchLocations> {
    const mainStorage = await this.storageRepo.findOne({
      where: { branchId, organizationId, isMainStorage: true },
    });
    if (!mainStorage) {
      throw new BadRequestException({
        code: 'TEMP_WAREHOUSE_BRANCH_MISSING_MAIN_STORAGE',
        message: `Branch ${branchId} has no main storage configured`,
      });
    }

    const warehouseLocation =
      (await this.locationRepo.findOne({
        where: {
          storageId: mainStorage.id,
          organizationId,
          isActive: true,
          isUnassigned: false,
          isDefault: true,
        },
      })) ??
      (await this.locationRepo.findOne({
        where: {
          storageId: mainStorage.id,
          organizationId,
          isActive: true,
          isUnassigned: false,
        },
        order: { createdAt: 'ASC' },
      }));
    if (!warehouseLocation) {
      throw new BadRequestException({
        code: 'TEMP_WAREHOUSE_MAIN_STORAGE_MISSING_LOCATION',
        message: `Main storage ${mainStorage.id} has no active location`,
      });
    }

    const mainShowroom = await this.showroomRepo.findOne({
      where: { branchId, organizationId, isMainShowroom: true },
    });
    if (!mainShowroom) {
      throw new BadRequestException({
        code: 'TEMP_WAREHOUSE_BRANCH_MISSING_MAIN_SHOWROOM',
        message: `Branch ${branchId} has no main showroom configured`,
      });
    }

    const showroomLocation =
      (await this.locationRepo.findOne({
        where: {
          storageId: mainShowroom.storageId,
          organizationId,
          isActive: true,
          isUnassigned: false,
          isDefault: true,
        },
      })) ??
      (await this.locationRepo.findOne({
        where: {
          storageId: mainShowroom.storageId,
          organizationId,
          isActive: true,
          isUnassigned: false,
        },
        order: { createdAt: 'ASC' },
      }));
    if (!showroomLocation) {
      throw new BadRequestException({
        code: 'TEMP_WAREHOUSE_MAIN_SHOWROOM_MISSING_LOCATION',
        message: `Showroom storage ${mainShowroom.storageId} has no active location`,
      });
    }

    return {
      warehouseStorageId: mainStorage.id,
      warehouseLocationId: warehouseLocation.id,
      showroomStorageId: mainShowroom.storageId,
      showroomLocationId: showroomLocation.id,
    };
  }
}
