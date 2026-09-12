import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  SearchItemCategoryTreeDto,
  SearchItemCategoryTreeResponseDto,
} from '../../inventory/location/dto/search-item-category-tree.dto';
import { SearchItemCategoryTreeQuery } from '../../inventory/location/queries/search-item-category-tree.query';

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
  constructor(private readonly queryBus: QueryBus) {}

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
}
