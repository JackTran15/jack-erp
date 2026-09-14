import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemCategoryTreeNodeDto } from '../../inventory/location/dto/search-item-category-tree.dto';
import { InventoryItemCategoryCrudService } from '../../inventory/location/item-category-crud.service';
import { ItemCategoryStatus } from '../../inventory/location/item-category.entity';
import { UnitOfMeasureCrudService } from '../../inventory/location/unit-of-measure-crud.service';
import {
  MobileItemCategoryCreateDto,
  MobileUnitCreateDto,
} from '../dto/mobile-catalog-write.dto';
import {
  MobileInventoryCategoryResponseDto,
  MobileInventoryUnitResponseDto,
} from '../dto/mobile-inventory-catalog.response.dto';

/**
 * Hai danh mục mà màn LỌC tồn kho của app cần để người dùng chọn: nhóm hàng
 * và đơn vị tính. Cả hai là mảng top-level, không phân trang — một tổ chức
 * có vài chục nhóm và vài đơn vị, màn chọn vẽ trọn trong một lượt cuộn.
 *
 * Nhóm hàng KHÔNG uỷ quyền cho `SearchItemCategoryTreeHandler` của web: nó
 * trả cây lồng kèm `description`/`code`/`status` mà app không cần, và đi qua
 * `QueryBus`. Một câu `SELECT` ba cột rẻ hơn một lớp map. Đơn vị đọc từ
 * `items.unit` — lý do ở `MobileInventoryUnitResponseDto`.
 */
@Injectable()
export class MobileInventoryCatalogService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly units: UnitOfMeasureCrudService,
    private readonly categories: InventoryItemCategoryCrudService,
  ) {}

  /**
   * Nhóm hàng đang hoạt động, sắp theo mã rồi tên (cùng thứ tự danh sách
   * phẳng của web). `parentId` giữ nguyên dù cha đã INACTIVE — app dựng cây
   * theo luật "cha không có trong tập thì con là gốc", đúng cách
   * `SearchItemCategoryTreeHandler` làm.
   */
  async listCategories(
    actor: ActorContext,
  ): Promise<MobileInventoryCategoryResponseDto[]> {
    return this.dataSource.query<MobileInventoryCategoryResponseDto[]>(
      `SELECT
         c.id::text              AS id,
         c.name,
         c.parent_group_id::text AS "parentId"
       FROM inventory_item_categories c
       WHERE c.organization_id = $1
         AND c.status = 'ACTIVE'
       ORDER BY c.code ASC NULLS LAST, c.name ASC, c.id ASC`,
      [actor.organizationId],
    );
  }

  /**
   * Đơn vị tính cho màn chọn, gộp KHÔNG phân biệt hoa/thường vì bộ lọc so
   * `lower()`. `MIN(name)` chọn một cách viết ổn định làm tên hiển thị.
   *
   * **HỢP của HAI nguồn**, và cả hai đều cần thiết:
   *
   * 1. `items.unit` — đơn vị ĐANG DÙNG trên hàng hoá. Đây là nguồn duy nhất mà
   *    bộ lọc tồn kho so khớp được (`?unit=` đối chiếu `lower(items.unit)`),
   *    nên bỏ nó đi là màn lọc mất hết lựa chọn có kết quả.
   * 2. `inventory_units` — danh mục đơn vị người dùng KHAI, kể cả đơn vị chưa
   *    gắn vào hàng hoá nào.
   *
   * Bản trước chỉ đọc nguồn 1, và điều đó làm màn "Thêm đơn vị tính" của app
   * thành ngõ cụt: tạo xong `Thùng` thì mở lại màn chọn KHÔNG thấy nó, vì chưa
   * hàng hoá nào dùng — người dùng không có cách nào biết bản ghi đã được tạo.
   *
   * `is_active = true` chỉ áp cho nguồn 2 — đó là cờ của danh mục
   * (`UnitOfMeasureEntity.isActive`: *"Inactive units are hidden from pickers"*).
   * Nguồn 1 không có cờ nào tương ứng, và một đơn vị đang nằm trên hàng hoá thật
   * thì phải chọn lọc được dù ai đó đã ngừng theo dõi nó trong danh mục.
   */
  async listUnits(actor: ActorContext): Promise<MobileInventoryUnitResponseDto[]> {
    return this.dataSource.query<MobileInventoryUnitResponseDto[]>(
      `SELECT code, MIN(name) AS name
       FROM (
         SELECT lower(i.unit) AS code, i.unit AS name
         FROM items i
         WHERE i.organization_id = $1
           AND i.unit IS NOT NULL
           AND i.unit <> ''

         UNION ALL

         SELECT lower(u.name) AS code, u.name AS name
         FROM inventory_units u
         WHERE u.organization_id = $1
           AND u.is_active = true
           AND u.name IS NOT NULL
           AND u.name <> ''
       ) merged
       GROUP BY code
       ORDER BY code ASC`,
      [actor.organizationId],
    );
  }

  /**
   * Tạo một đơn vị tính trong danh mục.
   *
   * **UỶ QUYỀN cho `UnitOfMeasureCrudService`** — nó đã giữ phần nghiệp vụ
   * (`beforeCreate` cắt khoảng trắng và chặn tên rỗng, ràng buộc UNIQUE theo
   * tổ chức). Viết thẳng một `INSERT` ở đây là bỏ qua chúng.
   *
   * Trả về ĐÚNG hình dạng của [listUnits] — `{ code, name }` với `code` là tên
   * viết thường. Nhờ vậy `UnitModel.fromJson` phía Dart parse thẳng response,
   * và giá trị pop về form hàng hoá khớp bit-đối-bit với dòng mà màn chọn sẽ
   * bày ở lần mở sau. Trả nguyên `UnitOfMeasureEntity` là buộc app phải biết
   * hai hình dạng cho cùng một khái niệm.
   */
  async createUnit(
    dto: MobileUnitCreateDto,
    actor: ActorContext,
  ): Promise<MobileInventoryUnitResponseDto> {
    const created = (await this.units.create(
      { name: dto.name, description: dto.description },
      actor,
    )) as { name?: unknown };

    // Lấy tên từ bản ghi ĐÃ GHI chứ không từ `dto`: `beforeCreate` cắt khoảng
    // trắng, nên hai giá trị lệch nhau khi người dùng gõ dư một dấu cách — và
    // `code` sai một ký tự là màn chọn không tô được dòng đang chọn.
    const name = typeof created.name === 'string' ? created.name : dto.name;

    return { code: name.toLowerCase(), name };
  }

  /**
   * Tạo một nhóm hàng hoá.
   *
   * Uỷ quyền cho `InventoryItemCategoryCrudService` cùng lý do như [createUnit].
   *
   * Trả về một NODE của cây (`ItemCategoryTreeNodeDto`) với `children` rỗng,
   * chứ không phải hình dạng phẳng của [listCategories]. Chọn vậy vì phía Dart
   * chỉ có MỘT model cho nhóm hàng (`ProductGroupModel`) và nó đọc khoá cha là
   * **`parentGroupId`** — tên của cây. Trả `parentId` sẽ parse ra `null`, tức
   * một nhóm con lặng lẽ hiện lên như nhóm gốc.
   *
   * `children: []` KHÔNG phải lời khẳng định nhóm này đã nằm trong cây đang
   * hiển thị — nó là sự thật: một nhóm vừa tạo chưa có con nào.
   */
  async createCategory(
    dto: MobileItemCategoryCreateDto,
    actor: ActorContext,
  ): Promise<ItemCategoryTreeNodeDto> {
    const created = (await this.categories.create(
      {
        name: dto.name,
        code: dto.code,
        parentGroupId: dto.parentGroupId,
        description: dto.description,
      },
      actor,
    )) as Record<string, unknown>;

    if (typeof created.id !== 'string' || !created.id) {
      throw new Error(
        'InventoryItemCategoryCrudService trả về bản ghi không có id — hợp đồng đã đổi.',
      );
    }

    const asString = (value: unknown): string | null =>
      typeof value === 'string' && value ? value : null;

    return {
      id: created.id,
      code: asString(created.code),
      name: typeof created.name === 'string' ? created.name : dto.name,
      description: asString(created.description),
      parentGroupId: asString(created.parentGroupId),
      status:
        created.status === ItemCategoryStatus.INACTIVE
          ? ItemCategoryStatus.INACTIVE
          : ItemCategoryStatus.ACTIVE,
      children: [],
    };
  }
}
