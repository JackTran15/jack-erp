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
import { PaginationQueryDto } from '../../crud/dto/pagination-query.dto';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchService } from '../../branch/branch.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { ProviderEntity } from './provider.entity';
import { StorageEntity } from './storage.entity';
import { ShowroomEntity } from './showroom.entity';
import { LocationEntity } from './location.entity';
import { StorageManagerAssignmentEntity } from './storage-manager-assignment.entity';
import {
  CreateItemDto,
  UpdateItemDto,
  CreateProviderDto,
  UpdateProviderDto,
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
    @InjectRepository(ItemCategoryEntity)
    private readonly itemCategoryRepo: Repository<ItemCategoryEntity>,
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

    if (dto.categoryId) {
      await this.validateCategory(dto.categoryId, actor);
    }

    const item = this.itemRepo.create({
      ...dto,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });
    return this.itemRepo.save(item);
  }

  async listItems(
    query: PaginationQueryDto,
    actor: ActorContext,
  ): Promise<PaginatedResponse<ItemEntity>> {
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.product', 'product')
      .where('item.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.search) {
      qb.andWhere(
        '(item.code ILIKE :s OR item.name ILIKE :s OR category.name ILIKE :s OR item.variantLabel ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const field = query.sortBy ?? 'createdAt';
    const order = (query.sortOrder ?? 'desc').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(`item.${field}`, order);

    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async getItemById(id: string, actor: ActorContext): Promise<ItemEntity> {
    const item = await this.itemRepo.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: ['category'],
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
    if (dto.categoryId) {
      await this.validateCategory(dto.categoryId, actor);
    }
    Object.assign(item, dto);
    return this.itemRepo.save(item);
  }

  private async validateCategory(
    categoryId: string,
    actor: ActorContext,
  ): Promise<void> {
    const cat = await this.itemCategoryRepo.findOne({
      where: { id: categoryId, organizationId: actor.organizationId },
    });
    if (!cat) {
      throw new BadRequestException(
        `Danh mục ${categoryId} không tồn tại trong tổ chức`,
      );
    }
  }

  /** Resolve an existing category by trimmed name, or create it if missing. Case-insensitive match. */
  async resolveOrCreateCategoryByName(
    rawName: string,
    actor: ActorContext,
  ): Promise<ItemCategoryEntity> {
    const name = rawName.trim();
    if (!name) {
      throw new BadRequestException('Tên danh mục không được để trống');
    }
    const existing = await this.itemCategoryRepo
      .createQueryBuilder('c')
      .where('c.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('LOWER(c.name) = LOWER(:name)', { name })
      .getOne();
    if (existing) return existing;
    return this.itemCategoryRepo.save(
      this.itemCategoryRepo.create({
        name,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
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

  /** Validate a provider exists, belongs to the org, and is active. Used by item-provider link flows. */
  async validateProvider(
    providerId: string,
    actor: ActorContext,
  ): Promise<ProviderEntity> {
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
    return provider;
  }

  // ─── Providers (org-scoped, no branch required) ─────────────────────

  async listProviders(
    query: PaginationQueryDto & { activeOnly?: string | boolean },
    actor: ActorContext,
  ): Promise<PaginatedResponse<ProviderEntity>> {
    const qb = this.providerRepo
      .createQueryBuilder('p')
      .where('p.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.search) {
      qb.andWhere(
        '(p.code ILIKE :s OR p.name ILIKE :s OR p.email ILIKE :s OR p.phone ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const activeOnly =
      query.activeOnly === true ||
      query.activeOnly === 'true' ||
      query.activeOnly === '1';
    if (activeOnly) {
      qb.andWhere('p.isActive = true');
    }

    const field = query.sortBy ?? 'createdAt';
    const order = (query.sortOrder ?? 'desc').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(`p.${field}`, order);

    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async getProviderById(id: string, actor: ActorContext): Promise<ProviderEntity> {
    const provider = await this.providerRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${id} not found`);
    }
    return provider;
  }

  async createProvider(
    dto: CreateProviderDto,
    actor: ActorContext,
  ): Promise<ProviderEntity> {
    const exists = await this.providerRepo.findOne({
      where: { organizationId: actor.organizationId, code: dto.code },
    });
    if (exists) {
      throw new ConflictException(
        `Mã nhà cung cấp "${dto.code}" đã tồn tại`,
      );
    }
    const provider = this.providerRepo.create({
      ...dto,
      isActive: dto.isActive ?? true,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });
    return this.providerRepo.save(provider);
  }

  async updateProvider(
    id: string,
    dto: UpdateProviderDto,
    actor: ActorContext,
  ): Promise<ProviderEntity> {
    const provider = await this.getProviderById(id, actor);
    if (dto.code && dto.code !== provider.code) {
      const dup = await this.providerRepo.findOne({
        where: { organizationId: actor.organizationId, code: dto.code },
      });
      if (dup && dup.id !== provider.id) {
        throw new ConflictException(
          `Mã nhà cung cấp "${dto.code}" đã tồn tại`,
        );
      }
    }
    Object.assign(provider, dto);
    return this.providerRepo.save(provider);
  }

  /** Soft-delete: mark provider inactive. Existing item / PO references are preserved. */
  async deactivateProvider(
    id: string,
    actor: ActorContext,
  ): Promise<ProviderEntity> {
    const provider = await this.getProviderById(id, actor);
    provider.isActive = false;
    return this.providerRepo.save(provider);
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

  async getBranchLocations(
    actor: ActorContext,
  ): Promise<{ warehouses: StorageEntity[]; showrooms: ShowroomEntity[] }> {
    if (!actor.branchId) {
      throw new BadRequestException('branchId is required');
    }

    const [storages, showrooms] = await Promise.all([
      this.storageRepo.find({
        where: {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
        },
        order: { isMainStorage: 'DESC', name: 'ASC' },
      }),
      this.showroomRepo.find({
        where: {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
        },
        order: { isMainShowroom: 'DESC', name: 'ASC' },
      }),
    ]);

    const showroomStorageIds = new Set(showrooms.map((s) => s.storageId));
    const warehouses = storages.filter((s) => !showroomStorageIds.has(s.id));

    return { warehouses, showrooms };
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
