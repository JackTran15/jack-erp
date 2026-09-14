import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import {
  MobileProductCreateDto,
  MobileProductUpdateDto,
} from '../dto/mobile-product-write.dto';
import { MobileProductPageDto } from '../dto/mobile-product.response.dto';
import { MobileProductService } from '../services/mobile-product.service';

/**
 * Danh mục hàng hoá cho app mobile.
 *
 * Đọc (danh sách + chi tiết) và GHI (tạo + sửa + xoá).
 *
 * `DELETE` uỷ quyền TRẦN cho `InventoryItemCrudService.remove` — đúng service
 * mà web gọi qua `/admin/entities/inventory-items/records/:id`, để hai đầu
 * hành xử giống hệt nhau kể cả khi đường xoá đang hỏng. Hệ quả và hai khiếm
 * khuyết đã biết của đường dùng chung ở `MobileProductService.remove`.
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
        categoryId: query.categoryId,
        isActive: query.isActive,
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

  /**
   * 201 chứ không 200: đây là tạo bản ghi thật — cùng luật mà
   * `MobileSupplierController.create` đã khai.
   *
   * Trả về ĐÚNG hình dạng của `GET /mobile/products/:id`, để
   * `ProductDetailModel.fromJson` phía Dart parse thẳng response mà không cần
   * model thứ hai.
   *
   * **`id` trong response có thể là mẫu mã HOẶC item lẻ**, tuỳ người dùng có gõ
   * chip Màu sắc/Size hay không. App không cần phân biệt: chính giá trị đó đưa
   * lại vào `GET`/`PATCH` là đúng bản ghi.
   */
  @Post()
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Tạo hàng hoá' })
  create(
    @Body() dto: MobileProductCreateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileProductDetailResponseDto> {
    return this.products.create(dto, actor);
  }

  /**
   * Định danh bằng `id` hỗn hợp, gương đúng `GET :id`.
   *
   * `dto.code` là mã MỚI thuần tuý; để trống nghĩa là GIỮ NGUYÊN mã cũ, không
   * phải xin cấp mã mới — xem `MobileProductService.update`.
   */
  @Patch(':id')
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Sửa hàng hoá theo id (mẫu mã hoặc item lẻ)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MobileProductUpdateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileProductDetailResponseDto> {
    return this.products.update(id, dto, actor);
  }

  /** Xoá CỨNG — hệ quả và các giới hạn ở `MobileProductService.remove`. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Xoá hàng hoá theo id (mẫu mã hoặc item lẻ)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.products.remove(id, actor);
  }
}
