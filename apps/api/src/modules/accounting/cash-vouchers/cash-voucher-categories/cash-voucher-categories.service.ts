import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BaseCrudService } from '../../../crud/base-crud.service';
import { CashVoucherCategoryDirection } from '../enums';
import { CashVoucherCategoryEntity } from './cash-voucher-category.entity';

export const CASH_VOUCHER_CATEGORY_SERVICE_TOKEN = 'CashVoucherCategoryCrudService';

/**
 * Mục thu / Mục chi as a parent → child tree (`parentGroupId`, same shape as
 * Nhóm hàng hoá). The DB only has the FK; every invariant below is held here:
 *
 * - a parent lives in the same org and is not soft-deleted;
 * - a parent has the same `direction` — the four voucher dialogs filter the
 *   dropdown by direction, so a mixed subtree would show children without
 *   their parent;
 * - no node is its own ancestor (checked at every depth, not just one);
 * - a node with live children keeps its direction and cannot be deleted —
 *   soft-delete never fires `ON DELETE SET NULL`, so refusing is the only way
 *   to avoid silently orphaning the subtree.
 */
@Injectable()
export class CashVoucherCategoriesService extends BaseCrudService<
  CashVoucherCategoryEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig =
    CASH_VOUCHER_CATEGORY_ENTITY_CONFIG;

  constructor(
    @InjectRepository(CashVoucherCategoryEntity)
    protected readonly repository: Repository<CashVoucherCategoryEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    if (payload.parentGroupId) {
      const parent = await this.loadParent(payload.parentGroupId, actor);
      this.assertSameDirection(parent, payload.direction);
    }
    return payload;
  }

  protected override async beforeUpdate(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const existing = await this.getById(id, actor);
    const direction: CashVoucherCategoryDirection =
      payload.direction ?? existing.direction;
    // `undefined` = field not sent (keep current); `null` = moved to root.
    const parentGroupId: string | null =
      payload.parentGroupId === undefined
        ? (existing.parentGroupId ?? null)
        : payload.parentGroupId;

    if (parentGroupId) {
      if (parentGroupId === id) {
        throw new BadRequestException(
          'Mục không thể là mục cha của chính nó',
        );
      }
      const parent = await this.loadParent(parentGroupId, actor);
      await this.assertNoCycle(id, parentGroupId, actor);
      this.assertSameDirection(parent, direction);
    }

    if (
      direction !== existing.direction &&
      (await this.hasChildren(id, actor))
    ) {
      throw new BadRequestException(
        'Không thể đổi loại của mục đang có mục con',
      );
    }
    return payload;
  }

  protected override async beforeDelete(
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    if (await this.hasChildren(id, actor)) {
      throw new BadRequestException('Không thể xóa mục đang có mục con');
    }
  }

  private async loadParent(
    parentGroupId: string,
    actor: ActorContext,
  ): Promise<CashVoucherCategoryEntity> {
    // Default find options exclude soft-deleted rows, so a deleted parent
    // reads as missing.
    const parent = await this.repository.findOne({
      where: { id: parentGroupId, organizationId: actor.organizationId },
    });
    if (!parent) {
      throw new BadRequestException('Mục cha không tồn tại');
    }
    return parent;
  }

  private assertSameDirection(
    parent: CashVoucherCategoryEntity,
    direction: CashVoucherCategoryDirection | undefined,
  ): void {
    if (direction !== undefined && parent.direction !== direction) {
      throw new BadRequestException('Mục cha phải cùng loại Thu/Chi');
    }
  }

  /**
   * Walks the ancestor chain from the proposed parent. The `seen` set is not
   * redundant: if the data already carried a cycle the loop would never end.
   */
  private async assertNoCycle(
    id: string,
    parentGroupId: string,
    actor: ActorContext,
  ): Promise<void> {
    const seen = new Set<string>([id]);
    let cursor: string | null | undefined = parentGroupId;

    while (cursor) {
      if (seen.has(cursor)) {
        throw new BadRequestException('Không thể chọn mục con làm mục cha');
      }
      seen.add(cursor);

      const node: CashVoucherCategoryEntity | null =
        await this.repository.findOne({
          where: { id: cursor, organizationId: actor.organizationId },
          select: { id: true, parentGroupId: true },
        });
      cursor = node?.parentGroupId;
    }
  }

  private async hasChildren(id: string, actor: ActorContext): Promise<boolean> {
    const count = await this.repository.count({
      where: { parentGroupId: id, organizationId: actor.organizationId },
    });
    return count > 0;
  }
}

export const CASH_VOUCHER_CATEGORY_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'cash-voucher-categories',
  displayName: 'Mục thu / Mục chi',
  apiResource: 'admin/entities/cash-voucher-categories',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'name', label: 'Tên', type: 'string', required: true },
    { key: 'description', label: 'Mô tả', type: 'string' },
    {
      key: 'direction',
      label: 'Loại',
      type: 'enum',
      required: true,
      enumValues: ['IN', 'OUT'],
      enumLabels: { IN: 'Thu', OUT: 'Chi' },
    },
    {
      key: 'parentGroupId',
      label: 'Mục cha',
      type: 'relation',
      relationEntity: 'cash-voucher-categories',
      hideInList: true,
    },
    { key: 'isActive', label: 'Đang hoạt động', type: 'boolean' },
    { key: 'displayOrder', label: 'Thứ tự hiển thị', type: 'number' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', readOnly: true },
  ],
  searchableFields: ['code', 'name'],
  filterDefinitions: [
    {
      key: 'direction',
      label: 'Loại',
      type: 'select',
      options: [
        { label: 'Thu', value: 'IN' },
        { label: 'Chi', value: 'OUT' },
      ],
    },
    {
      key: 'isActive',
      label: 'Đang hoạt động',
      type: 'select',
      options: [
        { label: 'Có', value: 'true' },
        { label: 'Không', value: 'false' },
      ],
    },
  ],
  permissions: {
    create: 'accounting.cash_voucher_category.create',
    read: 'accounting.cash_voucher_category.read',
    update: 'accounting.cash_voucher_category.update',
    delete: 'accounting.cash_voucher_category.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
