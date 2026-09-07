import {
  Body,
  Controller,
  Get,
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
  MobileSupplierListQueryDto,
  MobileSupplierSort,
} from '../dto/mobile-supplier-list.query.dto';
import {
  MobileSupplierPageDto,
  MobileSupplierResponseDto,
} from '../dto/mobile-supplier.response.dto';
import {
  MobileSupplierCreateDto,
  MobileSupplierUpdateDto,
} from '../dto/mobile-supplier-write.dto';
import { MobileSupplierService } from '../services/mobile-supplier.service';

/**
 * Nhà cung cấp cho app mobile. Tra cứu theo `id` (uuid), gương đúng mọi resource
 * khác của nền tảng (`docs/11-api-contracts.md`).
 *
 * Trước đây tra theo MÃ, vì `code` duy nhất trong một tổ chức và app điều hướng
 * bằng mã. Đã bỏ: form của app cho phép SỬA mã, nên khoá định danh lại là thứ
 * người dùng đổi được — mỗi lần đổi mã là đường dẫn cũ chết, và cả hai phía
 * phải mang thêm code chỉ để chữa cái đó. `id` bất biến nên vấn đề biến mất.
 *
 * `code` vẫn duy nhất trong tổ chức và vẫn sửa được — nay nó chỉ còn là một
 * trường dữ liệu bình thường.
 */
@ApiTags('mobile')
@Controller('mobile/suppliers')
@UseGuards(PermissionGuard)
export class MobileSupplierController {
  constructor(private readonly suppliers: MobileSupplierService) {}

  @Get()
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Danh sách nhà cung cấp, phân trang' })
  list(
    @Query() query: MobileSupplierListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileSupplierPageDto> {
    return this.suppliers.list(
      {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        sort: query.sort ?? MobileSupplierSort.NAME,
        search: query.search,
      },
      actor,
    );
  }

  /**
   * 201 chứ không 200: đây là tạo bản ghi thật. `MobileAuthController.login`
   * hạ xuống 200 vì đăng nhập không tạo tài nguyên nào — đừng chép nhầm.
   *
   * Trả về ĐÚNG hình dạng của `GET /mobile/suppliers/:id`, để
   * `SupplierModel.fromJson` phía Dart parse thẳng response mà không cần model
   * thứ hai.
   */
  @Post()
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Tạo nhà cung cấp' })
  create(
    @Body() dto: MobileSupplierCreateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileSupplierResponseDto> {
    return this.suppliers.create(dto, actor);
  }

  /**
   * `ParseUUIDPipe` KHÔNG phải trang trí: thiếu nó thì một path segment không
   * phải uuid đi thẳng xuống Postgres và ném `22P02` — người dùng nhận 500 cho
   * một đầu vào lẽ ra là 400.
   */
  @Get(':id')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Một nhà cung cấp theo id' })
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<MobileSupplierResponseDto> {
    return this.suppliers.findById(id, actor);
  }

  /**
   * Định danh bằng `id`, gương đúng `GET :id`.
   *
   * `dto.code` là mã MỚI thuần tuý. Đây là chỗ đổi `id` trả công rõ nhất: bản
   * tra theo mã phải mang mã CŨ trên path và mã MỚI trong body, hai giá trị
   * được phép khác nhau, và client phải tự điều hướng lại sau khi lưu. Nay
   * đường dẫn này không đổi dù mã đổi.
   */
  @Patch(':id')
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Sửa nhà cung cấp theo id' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MobileSupplierUpdateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileSupplierResponseDto> {
    return this.suppliers.update(id, dto, actor);
  }
}
