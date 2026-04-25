import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQuery, PaginatedResponse } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchService } from '../../branch/branch.service';
import { ItemEntity } from './item.entity';
import { ProviderEntity } from './provider.entity';
import { StorageEntity } from './storage.entity';
import { ShowroomEntity } from './showroom.entity';
import { LocationEntity } from './location.entity';
import { StorageManagerAssignmentEntity } from './storage-manager-assignment.entity';
import {
  CreateItemDto,
  UpdateItemDto,
  CreateStorageDto,
  UpdateStorageDto,
  CreateShowroomDto,
  UpdateShowroomDto,
  CreateLocationDto,
  UpdateLocationDto,
  AssignStorageManagerDto,
  UnassignStorageManagerDto,
} from './dto';

@Injectable()
export class InventoryLocationService {
  private readonly logger = new Logger(InventoryLocationService.name);

  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    @InjectRepository(StorageEntity)
    private readonly storageRepo: Repository<StorageEntity>,
    @InjectRepository(ShowroomEntity)
    private readonly showroomRepo: Repository<ShowroomEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(StorageManagerAssignmentEntity)
    private readonly assignmentRepo: Repository<StorageManagerAssignmentEntity>,
    private readonly branchService: BranchService,
  ) {}

  // ─── Items ───────────────────────────────────────────────────────────

  async createItem(dto: CreateItemDto, actor: ActorContext): Promise<ItemEntity> {
    const existing = await this.itemRepo.findOne({
      where: { organizationId: actor.organizationId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Item with code "${dto.code}" already exists`);
    }

    await this.validateProvider(dto.providerId, actor);

    const item = this.itemRepo.create({
      ...dto,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });
    return this.itemRepo.save(item);
  }

  async listItems(
    query: PaginationQuery,
    actor: ActorContext,
  ): Promise<PaginatedResponse<ItemEntity>> {
    const [data, total] = await this.itemRepo.findAndCount({
      where: { organizationId: actor.organizationId },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'DESC' },
    });
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async getItemById(id: string, actor: ActorContext): Promise<ItemEntity> {
    const item = await this.itemRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!item) {
      throw new NotFoundException(`Item ${id} not found`);
    }
    return item;
  }

  async updateItem(
    id: string,
    dto: UpdateItemDto,
    actor: ActorContext,
  ): Promise<ItemEntity> {
    const item = await this.getItemById(id, actor);
    if (dto.providerId) {
      await this.validateProvider(dto.providerId, actor);
    }
    Object.assign(item, dto);
    return this.itemRepo.save(item);
  }

  /** Resolve a provider by code within the actor's organization. */
  async resolveProviderByCode(
    code: string,
    actor: ActorContext,
  ): Promise<ProviderEntity> {
    const provider = await this.providerRepo.findOne({
      where: { organizationId: actor.organizationId, code },
    });
    if (!provider) {
      throw new NotFoundException(`Provider with code "${code}" not found`);
    }
    return provider;
  }

  private async validateProvider(
    providerId: string,
    actor: ActorContext,
  ): Promise<void> {
    const provider = await this.providerRepo.findOne({
      where: { id: providerId, organizationId: actor.organizationId },
    });
    if (!provider) {
      throw new BadRequestException(
        `Provider ${providerId} not found in this organization`,
      );
    }
    if (!provider.isActive) {
      throw new BadRequestException(
        `Provider "${provider.name}" is inactive and cannot be assigned to items`,
      );
    }
  }

  // ─── Storages ────────────────────────────────────────────────────────

  async createStorage(
    dto: CreateStorageDto,
    actor: ActorContext,
  ): Promise<StorageEntity> {
    const branch = await this.branchService.findById(dto.branchId, actor);

    if (dto.isMainStorage) {
      if (!branch.isMainBranch) {
        throw new BadRequestException(
          'Main storage can only be created under the main branch',
        );
      }

      const existingMain = await this.storageRepo.findOne({
        where: {
          organizationId: actor.organizationId,
          branchId: dto.branchId,
          isMainStorage: true,
        },
      });
      if (existingMain) {
        throw new ConflictException(
          'A main storage already exists for this branch',
        );
      }
    }

    const duplicate = await this.storageRepo.findOne({
      where: {
        branchId: dto.branchId,
        name: dto.name,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `Storage "${dto.name}" already exists in this branch`,
      );
    }

    const storage = this.storageRepo.create({
      name: dto.name,
      branchId: dto.branchId,
      isMainStorage: dto.isMainStorage ?? false,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });
    return this.storageRepo.save(storage);
  }

  async listStorages(
    query: PaginationQuery & { branchId?: string },
    actor: ActorContext,
  ): Promise<PaginatedResponse<StorageEntity>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
    if (query.branchId) {
      where.branchId = query.branchId;
    }

    const [data, total] = await this.storageRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'DESC' },
    });
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async getStorageById(id: string, actor: ActorContext): Promise<StorageEntity> {
    const storage = await this.storageRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!storage) {
      throw new NotFoundException(`Storage ${id} not found`);
    }
    return storage;
  }

  async updateStorage(
    id: string,
    dto: UpdateStorageDto,
    actor: ActorContext,
  ): Promise<StorageEntity> {
    const storage = await this.getStorageById(id, actor);
    Object.assign(storage, dto);
    return this.storageRepo.save(storage);
  }

  // ─── Showrooms ───────────────────────────────────────────────────────

  async createShowroom(
    dto: CreateShowroomDto,
    actor: ActorContext,
  ): Promise<ShowroomEntity> {
    const branch = await this.branchService.findById(dto.branchId, actor);

    const storage = await this.getStorageById(dto.storageId, actor);
    if (storage.branchId !== dto.branchId) {
      throw new BadRequestException(
        'Showroom must belong to the same branch as its parent storage',
      );
    }

    if (dto.isMainShowroom) {
      if (!branch.isMainBranch) {
        throw new BadRequestException(
          'Main showroom can only be created under the main branch',
        );
      }

      const existingMain = await this.showroomRepo.findOne({
        where: {
          organizationId: actor.organizationId,
          branchId: dto.branchId,
          isMainShowroom: true,
        },
      });
      if (existingMain) {
        throw new ConflictException(
          'A main showroom already exists for this branch',
        );
      }
    }

    const duplicate = await this.showroomRepo.findOne({
      where: {
        branchId: dto.branchId,
        name: dto.name,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `Showroom "${dto.name}" already exists in this branch`,
      );
    }

    const showroom = this.showroomRepo.create({
      name: dto.name,
      branchId: dto.branchId,
      storageId: dto.storageId,
      isMainShowroom: dto.isMainShowroom ?? false,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });
    return this.showroomRepo.save(showroom);
  }

  async listShowrooms(
    query: PaginationQuery & { branchId?: string; storageId?: string },
    actor: ActorContext,
  ): Promise<PaginatedResponse<ShowroomEntity>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.storageId) {
      where.storageId = query.storageId;
    }

    const [data, total] = await this.showroomRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'DESC' },
    });
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async getShowroomById(id: string, actor: ActorContext): Promise<ShowroomEntity> {
    const showroom = await this.showroomRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!showroom) {
      throw new NotFoundException(`Showroom ${id} not found`);
    }
    return showroom;
  }

  async updateShowroom(
    id: string,
    dto: UpdateShowroomDto,
    actor: ActorContext,
  ): Promise<ShowroomEntity> {
    const showroom = await this.getShowroomById(id, actor);
    Object.assign(showroom, dto);
    return this.showroomRepo.save(showroom);
  }

  // ─── Locations ───────────────────────────────────────────────────────

  async createLocation(
    dto: CreateLocationDto,
    actor: ActorContext,
  ): Promise<LocationEntity> {
    const storage = await this.getStorageById(dto.storageId, actor);
    if (storage.branchId !== dto.branchId) {
      throw new BadRequestException(
        'Location must belong to the same branch as its parent storage',
      );
    }

    const duplicate = await this.locationRepo.findOne({
      where: {
        storageId: dto.storageId,
        code: dto.code,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `Location with code "${dto.code}" already exists in this storage`,
      );
    }

    const location = this.locationRepo.create({
      code: dto.code,
      name: dto.name,
      storageId: dto.storageId,
      branchId: dto.branchId,
      type: dto.type,
      isActive: true,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });
    return this.locationRepo.save(location);
  }

  async listLocations(
    query: PaginationQuery & { storageId?: string; branchId?: string },
    actor: ActorContext,
  ): Promise<PaginatedResponse<LocationEntity>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
    if (query.storageId) {
      where.storageId = query.storageId;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }

    const [data, total] = await this.locationRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'DESC' },
    });
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async getLocationById(id: string, actor: ActorContext): Promise<LocationEntity> {
    const location = await this.locationRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!location) {
      throw new NotFoundException(`Location ${id} not found`);
    }
    return location;
  }

  async updateLocation(
    id: string,
    dto: UpdateLocationDto,
    actor: ActorContext,
  ): Promise<LocationEntity> {
    const location = await this.getLocationById(id, actor);
    Object.assign(location, dto);
    return this.locationRepo.save(location);
  }

  // ─── Storage Manager Assignments ─────────────────────────────────────

  async assignStorageManager(
    branchId: string,
    dto: AssignStorageManagerDto,
    actor: ActorContext,
  ): Promise<StorageManagerAssignmentEntity> {
    await this.branchService.findById(branchId, actor);

    const storage = await this.getStorageById(dto.storageId, actor);
    if (storage.branchId !== branchId) {
      throw new BadRequestException(
        'Storage does not belong to the specified branch',
      );
    }

    const existing = await this.assignmentRepo.findOne({
      where: { userId: dto.userId, storageId: dto.storageId },
    });
    if (existing) {
      throw new ConflictException(
        `User ${dto.userId} is already assigned as manager of storage ${dto.storageId}`,
      );
    }

    const assignment = this.assignmentRepo.create({
      userId: dto.userId,
      branchId,
      storageId: dto.storageId,
      organizationId: actor.organizationId,
      assignedBy: actor.userId,
    });
    return this.assignmentRepo.save(assignment);
  }

  async unassignStorageManager(
    branchId: string,
    dto: UnassignStorageManagerDto,
    actor: ActorContext,
  ): Promise<void> {
    await this.branchService.findById(branchId, actor);

    const assignment = await this.assignmentRepo.findOne({
      where: {
        userId: dto.userId,
        storageId: dto.storageId,
        branchId,
        organizationId: actor.organizationId,
      },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Storage manager assignment not found for user ${dto.userId} on storage ${dto.storageId}`,
      );
    }

    await this.assignmentRepo.remove(assignment);
  }

  async listStorageManagers(
    branchId: string,
    query: PaginationQuery & { storageId?: string },
    actor: ActorContext,
  ): Promise<PaginatedResponse<StorageManagerAssignmentEntity>> {
    await this.branchService.findById(branchId, actor);

    const where: Record<string, unknown> = {
      branchId,
      organizationId: actor.organizationId,
    };
    if (query.storageId) {
      where.storageId = query.storageId;
    }

    const [data, total] = await this.assignmentRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: { assignedAt: 'DESC' },
    });
    return { data, total, page: query.page, pageSize: query.pageSize };
  }
}
