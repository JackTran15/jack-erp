import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { SupplierGroupEntity } from './supplier-group.entity';

export const PROVIDER_GROUP_SERVICE_TOKEN = 'ProviderGroupCrudService';

@Injectable()
export class ProviderGroupCrudService extends BaseCrudService<
  SupplierGroupEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = PROVIDER_GROUP_ENTITY_CONFIG;

  constructor(
    @InjectRepository(SupplierGroupEntity)
    protected readonly repository: Repository<SupplierGroupEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override configureListQuery(
    qb: SelectQueryBuilder<SupplierGroupEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.parentGroup`, 'parentGroup');
  }

  protected override getByIdRelations(): string[] {
    return ['parentGroup'];
  }

  protected override transformListResults(data: SupplierGroupEntity[]): unknown[] {
    return data.map((row) => {
      const { parentGroup, ...rest } = row as any;
      return { ...rest, parentGroupName: parentGroup?.name ?? '' };
    });
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const next = this.normalizePayload(payload);
    if (next.parentGroupId) {
      await this.validateParentExists(next.parentGroupId, actor);
    }
    return next;
  }

  protected override async beforeUpdate(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const next = this.normalizePayload(payload);
    if (next.parentGroupId) {
      if (next.parentGroupId === id) {
        throw new BadRequestException('A supplier group cannot be its own parent');
      }
      await this.validateParentExists(next.parentGroupId, actor);
      await this.assertNoCycle(id, next.parentGroupId, actor);
    }
    return next;
  }

  /**
   * Chuẩn hoá "không có nhóm cha" về `null`, KHÔNG phải `undefined`.
   *
   * `BaseCrudService.update` dùng `repository.merge`, và TypeORM BỎ QUA mọi giá
   * trị `undefined` (`PlainObjectToNewEntityTransformer` chỉ gán khi
   * `objectColumnValue !== undefined`). Nên bản trước — vốn map về `undefined` —
   * làm thao tác "đưa một nhóm con lên làm nhóm gốc" trả 200 OK mà không đổi gì.
   *
   * `ItemCategoryCrudService.normalizeScalars` đã map về `null` từ trước; đây
   * chỉ là bắt kịp nó. Guard `if (next.parentGroupId)` ở hai hàm trên vẫn bỏ qua
   * `null` vì nó falsy, nên không phát sinh lượt tra thừa.
   */
  private normalizePayload(p: Record<string, any>): Record<string, any> {
    const n = { ...p };
    if (n.parentGroupId === '' || n.parentGroupId === null) {
      n.parentGroupId = null;
    }
    return n;
  }

  /**
   * Chặn vòng lặp cha-con Ở MỌI TẦNG.
   *
   * `beforeUpdate` chỉ so `parentGroupId === id`, tức chỉ chặn một tầng: `A -> B`
   * rồi `B -> A` vẫn dựng được một vòng, và khi đó mọi phép duyệt cây — kể cả
   * `SupplierGroupHelper.selectableParents` phía app — chạy vô tận.
   *
   * Tập [seen] KHÔNG thừa: dữ liệu có thể ĐÃ mang sẵn một vòng (tạo trước khi có
   * hàng rào này), và vòng `while` không có nó sẽ không bao giờ dừng.
   */
  private async assertNoCycle(
    id: string,
    parentGroupId: string,
    actor: ActorContext,
  ): Promise<void> {
    const seen = new Set<string>([id]);
    let cursor: string | undefined = parentGroupId;

    while (cursor) {
      if (seen.has(cursor)) {
        throw new BadRequestException(
          'Không thể chọn nhóm con làm nhóm cha.',
        );
      }
      seen.add(cursor);

      const node: SupplierGroupEntity | null = await this.repository.findOne({
        where: { id: cursor, organizationId: actor.organizationId },
        select: { id: true, parentGroupId: true },
      });
      cursor = node?.parentGroupId;
    }
  }

  private async validateParentExists(
    parentGroupId: string,
    actor: ActorContext,
  ): Promise<void> {
    const parent = await this.repository.findOne({
      where: { id: parentGroupId, organizationId: actor.organizationId },
    });
    if (!parent) {
      throw new BadRequestException(
        `Parent supplier group ${parentGroupId} not found`,
      );
    }
  }
}

export const PROVIDER_GROUP_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'provider-groups',
  displayName: 'Nhóm nhà cung cấp',
  apiResource: 'inventory/provider-groups',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã nhóm NCC', type: 'string', required: true },
    { key: 'name', label: 'Tên nhóm NCC', type: 'string', required: true },
    { key: 'parentGroupName', label: 'Thuộc nhóm NCC', type: 'string', readOnly: true },
    {
      key: 'parentGroupId',
      label: 'Thuộc nhóm NCC',
      type: 'relation',
      relationEntity: 'provider-groups',
      hideInList: true,
    },
    { key: 'description', label: 'Mô tả', type: 'string' },
    { key: 'isActive', label: 'Trạng thái', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', hideInList: true },
  ],
  searchableFields: ['code', 'name'],
  filterDefinitions: [
    {
      key: 'isActive',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Đang theo dõi', value: 'true' },
        { label: 'Ngừng theo dõi', value: 'false' },
      ],
    },
  ],
  permissions: {
    create: 'inventory.write',
    read: 'inventory.read',
    update: 'inventory.write',
    delete: 'inventory.write',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.HARD,
};
