import {
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  Repository,
  SelectQueryBuilder,
  FindOptionsWhere,
  DataSource,
  QueryFailedError,
} from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import {
  PaginatedResponse,
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
} from '@erp/shared-interfaces';

export type CrudOperation = 'create' | 'update' | 'delete';

export abstract class BaseCrudService<
  TEntity extends BaseEntity,
  TCreate extends Record<string, any>,
  TUpdate extends Record<string, any>,
> {
  protected abstract readonly repository: Repository<TEntity>;
  protected abstract readonly entityConfig: CrudEntityConfig;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly dataSource: DataSource) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async list(
    query: PaginationQueryDto,
    filters: Record<string, any>,
    actor: ActorContext,
  ): Promise<PaginatedResponse<TEntity>> {
    const alias = 'entity';
    const qb = this.repository.createQueryBuilder(alias);
    this.configureListQuery(qb, alias);

    this.applyScoping(qb, alias, actor);
    this.applySearch(qb, alias, query.search);
    this.applyFilters(qb, alias, filters);
    this.applySorting(qb, alias, query.sortBy, query.sortOrder);

    const page = query.page;
    const pageSize = query.pageSize;
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: this.transformListResults(data) as TEntity[],
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string, actor: ActorContext): Promise<TEntity> {
    const entity = await this.repository.findOne({
      where: this.buildScopedWhere(id, actor),
      relations: this.getByIdRelations(),
    });
    if (!entity) {
      throw new NotFoundException(`Record ${id} not found`);
    }
    return entity;
  }

  async create(payload: TCreate, actor: ActorContext): Promise<TEntity> {
    await this.validateBusinessRules('create', payload, actor);
    const prepared = await this.beforeCreate(payload, actor);

    const entity = this.repository.create({
      ...prepared,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    } as any);

    const saved = await this.repository.save(entity).catch((err) => {
      if (err instanceof QueryFailedError &&
        (((err as QueryFailedError & { code?: string }).code) ??
          (err as any).driverError?.code) === '23505') {
        throw new ConflictException(
          'A record with the same unique code already exists in this organization',
        );
      }
      throw err;
    }) as unknown as TEntity;
    this.logger.log(`Created ${this.entityConfig.entityKey} id=${(saved as any).id}`);
    await this.afterCreate(saved, actor);
    return saved;
  }

  async update(
    id: string,
    payload: TUpdate,
    actor: ActorContext,
  ): Promise<TEntity> {
    const existing = await this.getById(id, actor);
    await this.validateBusinessRules('update', payload, actor);
    const prepared = await this.beforeUpdate(id, payload, actor);

    if ((prepared as any).version !== undefined) {
      const currentVersion = (existing as any).version;
      if (
        currentVersion !== undefined &&
        (prepared as any).version !== currentVersion
      ) {
        throw new ConflictException(
          'Record was modified by another user — please reload and retry',
        );
      }
      delete (prepared as any).version;
    }

    const merged = this.repository.merge(existing, prepared as any);
    const saved = await this.repository.save(merged).catch((err) => {
      if (err instanceof QueryFailedError &&
        (((err as QueryFailedError & { code?: string }).code) ??
          (err as any).driverError?.code) === '23505') {
        throw new ConflictException(
          'A record with the same unique code already exists in this organization',
        );
      }
      throw err;
    });
    this.logger.log(`Updated ${this.entityConfig.entityKey} id=${id}`);
    await this.afterUpdate(saved, actor);
    return saved;
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.getById(id, actor);
    await this.validateBusinessRules('delete', { id } as any, actor);
    await this.beforeDelete(id, actor);

    const deletionPolicy =
      this.entityConfig.deletionPolicy ?? DeletionPolicy.SOFT;

    if (deletionPolicy === DeletionPolicy.DISABLED) {
      throw new BadRequestException(
        `Deletion is disabled for ${this.entityConfig.entityKey}`,
      );
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      if (deletionPolicy === DeletionPolicy.SOFT) {
        await runner.manager.save(
          Object.assign(existing, { deletedAt: new Date() } as any),
        );
      } else {
        await runner.manager.remove(existing);
      }
      await runner.commitTransaction();
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }

    this.logger.log(`Deleted ${this.entityConfig.entityKey} id=${id} (${deletionPolicy})`);
    await this.afterDelete(id, actor);
  }

  // ---------------------------------------------------------------------------
  // Extension hooks — override in domain services
  // ---------------------------------------------------------------------------

  protected async beforeCreate(
    payload: TCreate,
    _actor: ActorContext,
  ): Promise<TCreate> {
    return payload;
  }

  protected async afterCreate(
    _entity: TEntity,
    _actor: ActorContext,
  ): Promise<void> {}

  protected async beforeUpdate(
    _id: string,
    payload: TUpdate,
    _actor: ActorContext,
  ): Promise<TUpdate> {
    return payload;
  }

  protected async afterUpdate(
    _entity: TEntity,
    _actor: ActorContext,
  ): Promise<void> {}

  protected async beforeDelete(
    _id: string,
    _actor: ActorContext,
  ): Promise<void> {}

  protected async afterDelete(
    _id: string,
    _actor: ActorContext,
  ): Promise<void> {}

  protected async validateBusinessRules(
    _operation: CrudOperation,
    _payload: any,
    _actor: ActorContext,
  ): Promise<void> {}

  /** Optional joins or selects before scoping/search (e.g. eager relations for list). */
  protected configureListQuery(
    _qb: SelectQueryBuilder<TEntity>,
    _alias: string,
  ): void {}

  /** Map list rows before returning (e.g. flatten joined relations). */
  protected transformListResults(data: TEntity[]): unknown[] {
    return data;
  }

  /** Relations to load in getById; override when configureListQuery adds joins. */
  protected getByIdRelations(): string[] {
    return [];
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  protected applyScoping(
    qb: SelectQueryBuilder<TEntity>,
    alias: string,
    actor: ActorContext,
  ): void {
    const policy = this.entityConfig.scopingPolicy ?? ScopingPolicy.ORGANIZATION;

    qb.andWhere(`${alias}.organizationId = :orgId`, {
      orgId: actor.organizationId,
    });

    if (
      (policy === ScopingPolicy.BRANCH || policy === ScopingPolicy.MIXED) &&
      actor.branchId
    ) {
      qb.andWhere(`${alias}.branchId = :branchId`, {
        branchId: actor.branchId,
      });
    }
  }

  protected applySearch(
    qb: SelectQueryBuilder<TEntity>,
    alias: string,
    search?: string,
  ): void {
    if (!search) return;
    const searchable = this.entityConfig.searchableFields;
    if (!searchable.length) return;

    const conditions = searchable
      .map((f) => `${alias}.${f} ILIKE :search`)
      .join(' OR ');
    qb.andWhere(`(${conditions})`, { search: `%${search}%` });
  }

  protected applyFilters(
    qb: SelectQueryBuilder<TEntity>,
    alias: string,
    filters: Record<string, any>,
  ): void {
    const allowed = new Set(
      this.entityConfig.filterDefinitions.map((f) => f.key),
    );
    for (const [key, value] of Object.entries(filters)) {
      if (!allowed.has(key) || value === undefined || value === '') continue;
      if (Array.isArray(value)) {
        qb.andWhere(`${alias}.${key} IN (:...${key})`, { [key]: value });
      } else {
        qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
      }
    }
  }

  protected applySorting(
    qb: SelectQueryBuilder<TEntity>,
    alias: string,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ): void {
    const field = sortBy ?? 'createdAt';
    const order = (sortOrder ?? 'desc').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(`${alias}.${field}`, order);
  }

  protected buildScopedWhere(
    id: string,
    actor: ActorContext,
  ): FindOptionsWhere<TEntity> {
    const where: Record<string, any> = {
      id,
      organizationId: actor.organizationId,
    };
    const policy = this.entityConfig.scopingPolicy ?? ScopingPolicy.ORGANIZATION;
    if (
      (policy === ScopingPolicy.BRANCH || policy === ScopingPolicy.MIXED) &&
      actor.branchId
    ) {
      where.branchId = actor.branchId;
    }
    return where as FindOptionsWhere<TEntity>;
  }
}
