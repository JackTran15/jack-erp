import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import {
  PaginationQuery,
  PaginatedResponse,
  LocationType,
  DocumentType,
} from '@erp/shared-interfaces';
import { PaginationQueryDto } from '../../crud/dto/pagination-query.dto';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchService } from '../../branch/branch.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { BrandEntity } from './brand.entity';
import { UnitOfMeasureEntity } from './unit-of-measure.entity';
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
    @InjectRepository(BrandEntity)
    private readonly brandRepo: Repository<BrandEntity>,
    @InjectRepository(UnitOfMeasureEntity)
    private readonly unitRepo: Repository<UnitOfMeasureEntity>,
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
    private readonly docNumbering: DocumentNumberingService,
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

  /**
   * Resolve a category by its code, or create it if not found.
   * Falls back to `nameHint` as the display name when creating; if nameHint is
   * absent, the code itself is used as the name.
   */
  async resolveOrCreateCategoryByCode(
    rawCode: string,
    nameHint: string | undefined,
    actor: ActorContext,
  ): Promise<ItemCategoryEntity> {
    const code = rawCode.trim();
    if (!code) {
      throw new BadRequestException('Mã nhóm hàng hóa không được để trống');
    }
    // 1. Find by code
    const byCode = await this.itemCategoryRepo.findOne({
      where: { code, organizationId: actor.organizationId },
    });
    if (byCode) return byCode;

    const name = nameHint?.trim() || code;

    // 2. Find by name — avoids duplicate when the category was already created without a code
    const byName = await this.itemCategoryRepo
      .createQueryBuilder('c')
      .where('c.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('LOWER(c.name) = LOWER(:name)', { name })
      .getOne();

    if (byName) {
      // Back-fill the code so future lookups by code work
      if (!byName.code) {
        byName.code = code;
        await this.itemCategoryRepo.save(byName);
      }
      return byName;
    }

    // 3. Create new
    return this.itemCategoryRepo.save(
      this.itemCategoryRepo.create({
        code,
        name,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
  }

  /** Resolve an existing brand by trimmed name, or create it if missing. Case-insensitive match. */
  async resolveOrCreateBrandByName(
    rawName: string,
    actor: ActorContext,
  ): Promise<BrandEntity | null> {
    const name = rawName.trim();
    if (!name) return null;
    const existing = await this.brandRepo
      .createQueryBuilder('b')
      .where('b.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('LOWER(b.name) = LOWER(:name)', { name })
      .getOne();
    if (existing) return existing;
    return this.brandRepo.save(
      this.brandRepo.create({
        name,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
  }

  /** Resolve an existing unit by trimmed name, or create it if missing. Case-insensitive match. */
  async resolveOrCreateUnitByName(
    rawName: string,
    actor: ActorContext,
  ): Promise<UnitOfMeasureEntity | null> {
    const name = rawName.trim();
    if (!name) return null;
    const existing = await this.unitRepo
      .createQueryBuilder('u')
      .where('u.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('LOWER(u.name) = LOWER(:name)', { name })
      .getOne();
    if (existing) return existing;
    return this.unitRepo.save(
      this.unitRepo.create({
        name,
        isActive: true,
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

    // Generate the warehouse code outside the storage transaction: the
    // numbering service runs its own SERIALIZABLE counter transaction.
    const code = await this.docNumbering.generate(
      DocumentType.WAREHOUSE,
      dto.branchId,
      actor,
    );

    return this.storageRepo.manager.transaction(async (manager) => {
      const storage = await manager.save(
        manager.create(StorageEntity, {
          name: dto.name,
          code,
          branchId: dto.branchId,
          isMainStorage: dto.isMainStorage ?? false,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
        }),
      );
      await this.ensureUnassignedLocation(storage.id, actor, manager);
      return storage;
    });
  }

  /**
   * Get-or-create the virtual "Chưa xếp" (unassigned) location for a storage.
   * Concurrency-safe via the partial unique index
   * `UQ_locations_unassigned_per_storage` + `ON CONFLICT DO NOTHING`. Inherits
   * organization/branch scope from the storage.
   */
  async ensureUnassignedLocation(
    storageId: string,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<LocationEntity> {
    const repo = manager
      ? manager.getRepository(LocationEntity)
      : this.locationRepo;

    const existing = await repo.findOne({
      where: {
        organizationId: actor.organizationId,
        storageId,
        isUnassigned: true,
      },
    });
    if (existing) return existing;

    const storage = await (manager
      ? manager.getRepository(StorageEntity)
      : this.storageRepo
    ).findOne({
      where: { id: storageId, organizationId: actor.organizationId },
    });
    if (!storage) {
      throw new NotFoundException(`Storage ${storageId} not found`);
    }

    await repo
      .createQueryBuilder()
      .insert()
      .into(LocationEntity)
      .values({
        code: '__UNASSIGNED__',
        name: 'Chưa xếp',
        storageId,
        type: LocationType.ZONE,
        isActive: true,
        isUnassigned: true,
        organizationId: storage.organizationId,
        branchId: storage.branchId,
        createdBy: actor.userId,
      })
      .orIgnore()
      .execute();

    const location = await repo.findOne({
      where: {
        organizationId: actor.organizationId,
        storageId,
        isUnassigned: true,
      },
    });
    if (!location) {
      throw new NotFoundException(
        `Không thể tạo vị trí "Chưa xếp" cho kho ${storageId}`,
      );
    }
    return location;
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
    await this.branchService.findById(dto.branchId, actor);

    const storage = await this.getStorageById(dto.storageId, actor);
    if (storage.branchId !== dto.branchId) {
      throw new BadRequestException(
        'Showroom must belong to the same branch as its parent storage',
      );
    }

    // A branch has exactly one showroom, which is its main showroom.
    const existing = await this.showroomRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        branchId: dto.branchId,
      },
    });
    if (existing) {
      throw new ConflictException('This branch already has a showroom');
    }

    const showroom = this.showroomRepo.create({
      name: dto.name,
      branchId: dto.branchId,
      storageId: dto.storageId,
      isMainShowroom: true,
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
      // "Loại vị trí" is no longer surfaced in the UI (MISA has no such field);
      // default to SHELF when omitted so the NOT NULL enum column is satisfied.
      type: dto.type ?? LocationType.SHELF,
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });
    return this.locationRepo.save(location);
  }

  async listLocations(
    query: PaginationQuery & {
      storageId?: string;
      branchId?: string;
      includeUnassigned?: boolean;
    },
    actor: ActorContext,
  ): Promise<PaginatedResponse<LocationEntity>> {
    const branchId = actor.branchId ?? query.branchId;
    const qb = this.locationRepo
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.storage', 'storage')
      .where('location.organizationId = :organizationId', {
        organizationId: actor.organizationId,
      });
    if (query.storageId) {
      qb.andWhere('location.storageId = :storageId', {
        storageId: query.storageId,
      });
    }
    if (branchId) {
      qb.andWhere('storage.branchId = :branchId', { branchId });
    }
    // Hide the virtual "Chưa xếp" location from shelf pickers by default.
    if (!query.includeUnassigned) {
      qb.andWhere('location.isUnassigned = false');
    }

    const sortColumns: Record<string, string> = {
      code: 'location.code',
      name: 'location.name',
      createdAt: 'location.createdAt',
      updatedAt: 'location.updatedAt',
      isActive: 'location.isActive',
    };
    const sortColumn = query.sortBy ? sortColumns[query.sortBy] : undefined;
    if (sortColumn) {
      qb.orderBy(
        sortColumn,
        (query.sortOrder ?? 'asc').toUpperCase() as 'ASC' | 'DESC',
      );
    } else if (query.sortOrder) {
      qb.orderBy(
        'location.createdAt',
        query.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      );
    } else {
      qb.orderBy('location.code', 'ASC').addOrderBy('location.name', 'ASC');
    }

    const [data, total] = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    // Mark which locations already hold items ("Đã xếp" vs "Chưa xếp"): a
    // location is "đã xếp" when it has at least one stock_balance row.
    if (data.length > 0) {
      const rows = await this.locationRepo.manager
        .createQueryBuilder()
        .select('sb.location_id', 'locationId')
        .from('stock_balances', 'sb')
        .where('sb.organization_id = :org', { org: actor.organizationId })
        .andWhere('sb.location_id IN (:...ids)', {
          ids: data.map((l) => l.id),
        })
        .groupBy('sb.location_id')
        .getRawMany<{ locationId: string }>();
      const placed = new Set(rows.map((r) => r.locationId));
      for (const loc of data) {
        loc.hasItems = placed.has(loc.id);
      }
    }

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

    // The virtual "Chưa xếp" location is system-managed.
    if (location.isUnassigned) {
      throw new BadRequestException('Không thể sửa vị trí hệ thống "Chưa xếp".');
    }

    const codeChanged = dto.code != null && dto.code !== location.code;
    const storageChanged =
      dto.storageId != null && dto.storageId !== location.storageId;

    // Re-homing a location that already holds stock would silently move that
    // stock to another storage (and rewrite which storage its historical ledger
    // entries belong to). Block it — move the stock with a transfer first.
    if (storageChanged) {
      const target = await this.getStorageById(dto.storageId!, actor);
      if (target.branchId !== location.branchId) {
        throw new BadRequestException(
          'Không thể chuyển vị trí sang kho thuộc chi nhánh khác.',
        );
      }
      const stockCount = await this.locationRepo.manager
        .createQueryBuilder()
        .from('stock_balances', 'sb')
        .where('sb.location_id = :id', { id: location.id })
        .getCount();
      if (stockCount > 0) {
        throw new BadRequestException(
          'Vị trí đang có hàng nên không thể đổi kho. Hãy chuyển hàng sang vị trí khác trước.',
        );
      }
    }

    // Enforce (storage, code) uniqueness when either changes.
    if (codeChanged || storageChanged) {
      const nextStorageId = dto.storageId ?? location.storageId;
      const nextCode = dto.code ?? location.code;
      const duplicate = await this.locationRepo.findOne({
        where: {
          storageId: nextStorageId,
          code: nextCode,
          organizationId: actor.organizationId,
        },
      });
      if (duplicate && duplicate.id !== location.id) {
        throw new ConflictException(
          `Vị trí với mã "${nextCode}" đã tồn tại trong kho này.`,
        );
      }
    }

    if (dto.code != null) location.code = dto.code;
    if (dto.name != null) location.name = dto.name;
    if (dto.storageId != null) location.storageId = dto.storageId;
    if (dto.type != null) location.type = dto.type;
    if (dto.isActive != null) location.isActive = dto.isActive;
    if (dto.description !== undefined) location.description = dto.description ?? null;

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
