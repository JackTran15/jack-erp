import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  MobileProductListQueryDto,
  MobileProductSort,
} from '../dto/mobile-product-list.query.dto';
import { MobileProductPageDto } from '../dto/mobile-product.response.dto';
import { MobileProductService } from '../services/mobile-product.service';

/**
 * Danh mục hàng hoá cho app mobile.
 *
 * CHỈ có đường ĐỌC danh sách. Chưa có `GET :id` vì app chưa có màn chi tiết, và
 * chưa có `POST`/`PATCH` vì app chưa có form — thêm khi màn tương ứng ra đời,
 * đừng dựng sẵn.
 *
 * Một dòng là một MẪU MÃ chứ không phải một biến thể; lý do và cách gộp ở
 * `MobileProductService`.
 */
@ApiTags('mobile')
@Controller('mobile/products')
@UseGuards(PermissionGuard)
export class MobileProductController {
  constructor(private readonly products: MobileProductService) {}

  @Get()
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Danh sách hàng hoá, phân trang' })
  list(
    @Query() query: MobileProductListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileProductPageDto> {
    return this.products.list(
      {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        sort: query.sort ?? MobileProductSort.NAME,
        search: query.search,
      },
      actor,
    );
  }
}
