import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileItemListQueryDto } from '../dto/mobile-item-list.query.dto';
import { MobileItemPageDto } from '../dto/mobile-item.response.dto';
import { MobileItemService } from '../services/mobile-item.service';

/**
 * Hàng hoá để thêm vào phiếu kho.
 *
 * TÁCH khỏi `/mobile/products` dù cùng nói về hàng hoá, vì hai đường trả hai
 * thứ khác nhau và phục vụ hai màn khác nhau:
 *
 * | | `/mobile/products` | `/mobile/items` |
 * |---|---|---|
 * | một dòng là | một MẪU MÃ | một BIẾN THỂ |
 * | `id` | `products.id` hoặc `items.id` tuỳ dòng | luôn là `items.id` |
 * | phục vụ | màn danh mục hàng hoá | màn chọn hàng khi lập phiếu |
 *
 * Gộp hai đường làm một là buộc màn danh mục phải liệt kê sáu dòng cho một đôi
 * giày có sáu size — thứ mà nó cố ý gộp lại.
 */
@ApiTags('mobile')
@Controller('mobile/items')
@UseGuards(PermissionGuard)
export class MobileItemController {
  constructor(private readonly items: MobileItemService) {}

  @Get()
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Hàng hoá (biến thể) để thêm vào phiếu, phân trang' })
  @ApiOkResponse({ type: MobileItemPageDto })
  list(
    @Query() query: MobileItemListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileItemPageDto> {
    return this.items.list(
      { page: query.page ?? 1, limit: query.limit ?? 20, search: query.search },
      actor,
    );
  }
}
