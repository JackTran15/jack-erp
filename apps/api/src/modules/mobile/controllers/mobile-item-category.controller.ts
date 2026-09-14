import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  ItemCategoryTreeNodeDto,
  SearchItemCategoryTreeDto,
  SearchItemCategoryTreeResponseDto,
} from '../../inventory/location/dto/search-item-category-tree.dto';
import { SearchItemCategoryTreeQuery } from '../../inventory/location/queries/search-item-category-tree.query';
import { MobileItemCategoryCreateDto } from '../dto/mobile-catalog-write.dto';
import { MobileInventoryCatalogService } from '../services/mobile-inventory-catalog.service';

/**
 * Nhóm hàng hoá dưới dạng CÂY — nguồn của bộ lọc *"Nhóm hàng hoá"* trên màn bán
 * hàng.
 *
 * **Uỷ quyền thẳng cho `SearchItemCategoryTreeQuery`**, đúng cây mà backoffice
 * đang dùng (`POST /v2/inventory/item-categories/tree`). Không viết lại truy
 * vấn: cây nhóm là dữ liệu CHUNG, và hai bản dựng cây sẽ phân kỳ ở lần đầu ai
 * đó đổi luật sắp xếp.
 *
 * Hai khác biệt với đường của web, cả hai đều có lý do:
 *
 * 1. **`GET` chứ không `POST`.** Đây là thao tác ĐỌC không có body; đường kia
 *    dùng `POST` vì nó nằm trong khuôn CQRS-search của web, và trả 201 cho một
 *    lượt đọc là thứ client mobile phải nới quy ước mới nhận được.
 * 2. **Quyền là `inventory.item.read`**, không phải `inventory.read`. Cả hai
 *    vai bán hàng đều có nó, còn `inventory.read` mở cả bề mặt kho — rộng hơn
 *    mức một bộ lọc danh mục cần. Cùng lập luận đã ghi ở
 *    `MobileSalesItemController`.
 *
 * KHÔNG nhận `status`: màn bán hàng chỉ có nghĩa với nhóm còn hoạt động, và
 * phơi tham số đó ra là mời client tự bịa một chính sách thứ hai.
 */
@ApiTags('mobile')
@Controller('mobile/item-categories')
@UseGuards(PermissionGuard)
export class MobileItemCategoryController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly catalog: MobileInventoryCatalogService,
  ) {}

  @Get('tree')
  @RequirePermission('inventory.item.read')
  @ApiOperation({ summary: 'Nhóm hàng hoá dạng cây cha → con' })
  @ApiOkResponse({ type: SearchItemCategoryTreeResponseDto })
  tree(
    @Query() query: SearchItemCategoryTreeDto,
    @Actor() actor: ActorContext,
  ): Promise<SearchItemCategoryTreeResponseDto> {
    return this.queryBus.execute(
      new SearchItemCategoryTreeQuery(query, actor),
    );
  }

  /**
   * Tạo một nhóm hàng hoá — mở từ nút `+` ngay trong form hàng hoá của app.
   *
   * **Quyền là `inventory.write`, KHÔNG phải `inventory.item.read` của [tree].**
   * Hai đường cùng một controller nhưng khác hẳn về hệ quả: đọc cây nhóm là
   * việc mọi vai bán hàng làm, còn thêm một nhóm là sửa danh mục dùng chung
   * toàn tổ chức. Đừng "cho đồng bộ" bằng cách hạ quyền xuống bằng [tree].
   *
   * Response là MỘT node của cây với `children` rỗng — cùng hình dạng mà [tree]
   * trả cho một lá, để phía Dart chỉ cần một model duy nhất. Lý do đầy đủ ở
   * `MobileInventoryCatalogService.createCategory`.
   */
  @Post()
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Tạo một nhóm hàng hoá' })
  @ApiOkResponse({ type: ItemCategoryTreeNodeDto })
  create(
    @Body() dto: MobileItemCategoryCreateDto,
    @Actor() actor: ActorContext,
  ): Promise<ItemCategoryTreeNodeDto> {
    return this.catalog.createCategory(dto, actor);
  }
}
