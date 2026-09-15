import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  MobileSupplierGroupListDto,
  MobileSupplierGroupResponseDto,
} from '../dto/mobile-supplier-group.response.dto';
import {
  MobileSupplierGroupCreateDto,
  MobileSupplierGroupUpdateDto,
} from '../dto/mobile-supplier-group-write.dto';
import { MobileSupplierGroupService } from '../services/mobile-supplier-group.service';

/**
 * Danh mục nhóm nhà cung cấp cho app mobile.
 *
 * **Đường dẫn là `supplier-groups`, không phải `provider-groups`** dù `entityKey`
 * phía backend là vậy: bề mặt mobile nói "supplier" xuyên suốt
 * (`/mobile/suppliers`), và đổi từ vựng giữa chừng là bắt phía Dart nhớ hai tên
 * cho một khái niệm.
 *
 * **KHÔNG lồng dưới `/mobile/suppliers`**: `/mobile/suppliers/groups` sẽ đụng
 * `@Get(':id')` của `MobileSupplierController`, nơi `ParseUUIDPipe` biến
 * `groups` thành 400. Thứ tự đăng ký route chữa được, nhưng đó là một cái bẫy
 * vĩnh viễn cho người sau.
 *
 * **KHÔNG có `DELETE`.** App không có thao tác xoá nhóm, và
 * `DeletionPolicy.HARD` + `onDelete: SET NULL` nghĩa là xoá một nhóm sẽ âm thầm
 * gỡ nhóm khỏi mọi nhà cung cấp đang dùng, đồng thời đẩy mọi nhóm con lên gốc —
 * không cảnh báo nào. Đường `/admin/entities` vẫn giữ nó cho backoffice.
 *
 * Quyền khớp đúng `PROVIDER_GROUP_ENTITY_CONFIG.permissions`. Đọc dùng
 * `inventory.read` chứ KHÔNG hạ xuống `inventory.item.read` như
 * `MobileItemCategoryController`: lý do ở đó là màn BÁN HÀNG không nên mang
 * `inventory.read`, còn picker nhóm nhà cung cấp chỉ mở từ form nhà cung cấp,
 * vốn đã đòi `inventory.read`.
 *
 * **CẤM `@Version()`** — `MobileModule` cố ý đứng ngoài versioning; thêm vào là
 * ra `/v1/mobile/...` và app gọi trượt.
 */
@ApiTags('mobile')
@Controller('mobile/supplier-groups')
@UseGuards(PermissionGuard)
export class MobileSupplierGroupController {
  constructor(private readonly groups: MobileSupplierGroupService) {}

  @Get()
  @RequirePermission('inventory.read')
  @ApiOperation({
    summary: 'Trọn danh mục nhóm nhà cung cấp, PHẲNG, không phân trang',
  })
  list(@Actor() actor: ActorContext): Promise<MobileSupplierGroupListDto> {
    return this.groups.list(actor);
  }

  @Post()
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Tạo một nhóm nhà cung cấp' })
  create(
    @Body() dto: MobileSupplierGroupCreateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileSupplierGroupResponseDto> {
    return this.groups.create(dto, actor);
  }

  /**
   * `ParseUUIDPipe` BẮT BUỘC: thiếu nó thì một segment không phải uuid đi thẳng
   * xuống Postgres và ném `22P02` — trả 500 thay cho một câu 400 đọc được.
   */
  @Patch(':id')
  @RequirePermission('inventory.write')
  @ApiOperation({ summary: 'Sửa một nhóm nhà cung cấp' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MobileSupplierGroupUpdateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileSupplierGroupResponseDto> {
    return this.groups.update(id, dto, actor);
  }
}
