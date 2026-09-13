import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { MobileProductDetailResponseDto } from '../dto/mobile-product-detail.response.dto';
import { MobileProductPageDto } from '../dto/mobile-product.response.dto';
import { MobileProductService } from '../services/mobile-product.service';

/**
 * Danh mục hàng hoá cho app mobile.
 *
 * CHỈ có đường ĐỌC: danh sách và chi tiết. Chưa có `POST`/`PATCH`/`DELETE` vì
 * app chưa có form — hai nút Sửa/Xoá trên màn chi tiết của app hiện chỉ báo
 * "sắp có". Thêm khi màn tương ứng ra đời, đừng dựng sẵn.
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

  /**
   * `ParseUUIDPipe` KHÔNG phải trang trí: thiếu nó thì một path segment không
   * phải uuid đi thẳng xuống Postgres và ném `22P02` — người dùng nhận 500 cho
   * một đầu vào lẽ ra là 400.
   *
   * `id` là giá trị HỖN HỢP mà [list] trả (mẫu mã hoặc item lẻ); service tự
   * phân giải, xem `MobileProductService.findById`.
   */
  @Get(':id')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Chi tiết một hàng hoá theo id (mẫu mã hoặc item lẻ)' })
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<MobileProductDetailResponseDto> {
    return this.products.findById(id, actor);
  }
}
