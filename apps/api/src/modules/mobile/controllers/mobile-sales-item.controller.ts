import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileSalesItemListQueryDto } from '../dto/mobile-sales-item-list.query.dto';
import { MobileSalesItemPageDto } from '../dto/mobile-sales-item.response.dto';
import { MobileSalesModelStockDto } from '../dto/mobile-sales-model-stock.response.dto';
import { MobileSalesModelDetailDto } from '../dto/mobile-sales-model.response.dto';
import { MobileSalesItemService } from '../services/mobile-sales-item.service';

/**
 * Danh mục hàng hoá của màn BÁN HÀNG.
 *
 * Đường thứ ba nói về hàng hoá; bảng so sánh trọn vẹn với `/mobile/products` và
 * `/mobile/items` ở doc của `MobileSalesItemResponseDto`. Tóm tắt lý do tồn
 * tại: màn bán hàng cần **`items.id`** (để làm khoá dòng đơn) **và** **giá
 * bán** — không đường nào có sẵn trả cả hai.
 *
 * Quyền là `inventory.item.read`, KHÔNG phải `inventory.read` như hai đường
 * kia. Cả hai vai bán hàng đều có nó (`SALES` và `CASHIER` trong
 * `seeds/org-role-permissions.ts`), và nó hẹp đúng bằng thứ endpoint này làm:
 * đọc danh mục mặt hàng. `inventory.read` mở cả bề mặt kho — rộng hơn mức một
 * màn bán hàng cần.
 *
 * Query DTO đã TÁCH khỏi `MobileItemListQueryDto` — đúng vào lúc bản trước hẹn
 * là sẽ tách: *"ngày nào màn bán hàng cần thêm bộ lọc riêng thì mới tách"*.
 * `viewBy` và `inStockOnly` là ngày đó; ba tham số phân trang/tìm kiếm vẫn kế
 * thừa, nên chúng không có cơ hội phân kỳ.
 */
@ApiTags('mobile')
@Controller('mobile/sales-items')
@UseGuards(PermissionGuard)
export class MobileSalesItemController {
  constructor(private readonly salesItems: MobileSalesItemService) {}

  @Get()
  @RequirePermission('inventory.item.read')
  @ApiOperation({
    summary: 'Danh mục để bán — biến thể hoặc mẫu mã, kèm giá bán, phân trang',
  })
  @ApiOkResponse({ type: MobileSalesItemPageDto })
  list(
    @Query() query: MobileSalesItemListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileSalesItemPageDto> {
    return this.salesItems.list(
      {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        search: query.search,
        viewBy: query.viewBy,
        inStockOnly: query.inStockOnly,
        categoryId: query.categoryId,
      },
      actor,
    );
  }

  /**
   * Chi tiết một mẫu mã, để bày bảng chọn biến thể.
   *
   * Đường CON của `/mobile/sales-items` chứ không một controller riêng: nó chỉ
   * có nghĩa khi đi cùng `viewBy=model` của danh sách bên trên, và tách ra là
   * hai chỗ phải nhớ giữ chung một luật "biến thể nào còn bán được".
   */
  @Get('models/:productId')
  @RequirePermission('inventory.item.read')
  @ApiOperation({ summary: 'Các chiều biến thiên và biến thể của một mẫu mã' })
  @ApiOkResponse({ type: MobileSalesModelDetailDto })
  getModel(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Actor() actor: ActorContext,
  ): Promise<MobileSalesModelDetailDto> {
    return this.salesItems.getModel(productId, actor);
  }

  /**
   * Tồn kho của một mẫu mã — cho màn **Chi tiết hàng hoá**.
   *
   * Tách khỏi `models/:productId` chứ không thêm trường vào đó: bảng chọn biến thể gọi đường kia
   * ở MỌI lượt chạm một dòng danh mục, và nó không cần tồn kho. Nhét tồn vào đó là bắt mọi lượt
   * mở bảng chọn trả tiền cho một phép gom mà nó vứt đi.
   *
   * `inventory.read` chứ không `inventory.item.read`: phép gom tồn nằm ở bề mặt kho. Cả hai vai
   * bán hàng đều có quyền này (`org-role-permissions.ts`) — một chú thích cũ ở
   * `mobile-sales-model.response.dto.ts` nói ngược lại và đã lỗi thời.
   */
  @Get('models/:productId/stock')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOperation({ summary: 'Tồn kho của một mẫu mã: theo biến thể, theo kho, theo chi nhánh khác' })
  @ApiOkResponse({ type: MobileSalesModelStockDto })
  getModelStock(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Actor() actor: ActorContext,
  ): Promise<MobileSalesModelStockDto> {
    return this.salesItems.getModelStock(productId, actor);
  }
}
