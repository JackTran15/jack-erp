import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemCategoryEntity } from './item-category.entity';
import {
  CommissionMethod,
  ItemCategoryCommissionEntity,
} from './item-category-commission.entity';

export const INVENTORY_ITEM_CATEGORY_SERVICE_TOKEN =
  'InventoryItemCategoryCrudService';

interface NormalizedCommission {
  positionId: string | null;
  positionName: string | null;
  method: CommissionMethod;
  rate: number;
  discountLimitPercent: number;
}

@Injectable()
export class InventoryItemCategoryCrudService extends BaseCrudService<
  ItemCategoryEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig =
    INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ItemCategoryEntity)
    protected readonly repository: Repository<ItemCategoryEntity>,
    @InjectRepository(ItemCategoryCommissionEntity)
    private readonly commissionRepo: Repository<ItemCategoryCommissionEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  override async create(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<any> {
    const { commissions, ...rest } = payload;
    this.normalizeScalars(rest);
    await this.ensureParentValid(rest.parentGroupId, actor);

    const normalizedCommissions = this.normalizeCommissions(commissions);
    const saved = (await super.create(rest, actor)) as ItemCategoryEntity;
    if (normalizedCommissions !== undefined) {
      await this.reconcileCommissions(saved.id, normalizedCommissions, actor);
    }
    return saved;
  }

  override async update(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<any> {
    const { commissions, ...rest } = payload;
    this.normalizeScalars(rest);
    if (rest.parentGroupId !== undefined) {
      await this.ensureParentValid(rest.parentGroupId, actor, id);
    }

    const saved = (await super.update(id, rest, actor)) as ItemCategoryEntity;
    if (commissions !== undefined) {
      await this.reconcileCommissions(
        id,
        this.normalizeCommissions(commissions) ?? [],
        actor,
      );
    }
    return saved;
  }

  override async getById(id: string, actor: ActorContext): Promise<any> {
    const category = await super.getById(id, actor);
    const commissions = await this.commissionRepo.find({
      where: { categoryId: id, organizationId: actor.organizationId },
    });
    return { ...category, commissions };
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    const raw = payload.name;
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name) {
      throw new BadRequestException('Category name is required');
    }
    return { ...payload, name };
  }

  protected override async beforeUpdate(
    _id: string,
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    if (payload.name !== undefined) {
      const name =
        typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        throw new BadRequestException('Category name is required');
      }
      return { ...payload, name };
    }
    return payload;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  /** Coerce empty-string scalars (from the unvalidated generic CRUD payload)
   *  into nulls so nullable columns accept them. */
  private normalizeScalars(rest: Record<string, any>): void {
    if (rest.parentGroupId === '') rest.parentGroupId = null;
    if (rest.code === '') rest.code = null;
    if (rest.description === '') rest.description = null;
  }

  private async ensureParentValid(
    parentGroupId: string | null | undefined,
    actor: ActorContext,
    selfId?: string,
  ): Promise<void> {
    if (!parentGroupId) return;
    if (selfId && parentGroupId === selfId) {
      throw new BadRequestException('A category cannot be its own parent group');
    }
    const parent = await this.repository.findOne({
      where: { id: parentGroupId, organizationId: actor.organizationId },
    });
    if (!parent) {
      throw new BadRequestException(
        `Parent category ${parentGroupId} not found in organization`,
      );
    }
  }

  private normalizeCommissions(
    raw: unknown,
  ): NormalizedCommission[] | undefined {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is Record<string, any> => !!r && typeof r === 'object')
      .map((r) => ({
        positionId:
          typeof r.positionId === 'string' && r.positionId ? r.positionId : null,
        positionName:
          typeof r.positionName === 'string' && r.positionName.trim()
            ? r.positionName.trim()
            : null,
        method:
          r.method === CommissionMethod.AMOUNT
            ? CommissionMethod.AMOUNT
            : CommissionMethod.PERCENT,
        rate: Number(r.rate) || 0,
        discountLimitPercent: Number(r.discountLimitPercent) || 0,
      }));
  }

  private async reconcileCommissions(
    categoryId: string,
    commissions: NormalizedCommission[],
    actor: ActorContext,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ItemCategoryCommissionEntity, {
        categoryId,
        organizationId: actor.organizationId,
      });
      if (commissions.length === 0) return;
      const rows = commissions.map((c) =>
        manager.create(ItemCategoryCommissionEntity, {
          categoryId,
          positionId: c.positionId ?? undefined,
          positionName: c.positionName ?? undefined,
          method: c.method,
          rate: c.rate,
          discountLimitPercent: c.discountLimitPercent,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
        }),
      );
      await manager.save(ItemCategoryCommissionEntity, rows);
    });
  }
}

export const INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-item-categories',
  displayName: 'Danh mục hàng',
  apiResource: 'inventory/item-categories',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã nhóm hàng hóa', type: 'string' },
    { key: 'name', label: 'Tên danh mục', type: 'string', required: true },
    { key: 'parentGroupId', label: 'Thuộc nhóm', type: 'string', hideInList: true },
    { key: 'description', label: 'Mô tả', type: 'string', hideInList: true },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
  ],
  searchableFields: ['name', 'code'],
  filterDefinitions: [],
  permissions: {
    create: 'inventory.write',
    read: 'inventory.read',
    update: 'inventory.write',
    delete: 'inventory.write',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.HARD,
};
