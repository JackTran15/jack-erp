import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
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
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
   * Đơn vị đang có trên hàng hoá, gộp KHÔNG phân biệt hoa/thường vì bộ lọc so
   * `lower()`. `MIN(unit)` chọn một cách viết ổn định làm tên hiển thị.
   */
  async listUnits(actor: ActorContext): Promise<MobileInventoryUnitResponseDto[]> {
    return this.dataSource.query<MobileInventoryUnitResponseDto[]>(
      `SELECT lower(i.unit) AS code, MIN(i.unit) AS name
       FROM items i
       WHERE i.organization_id = $1
         AND i.unit IS NOT NULL
         AND i.unit <> ''
       GROUP BY lower(i.unit)
       ORDER BY lower(i.unit) ASC`,
      [actor.organizationId],
    );
  }
}
