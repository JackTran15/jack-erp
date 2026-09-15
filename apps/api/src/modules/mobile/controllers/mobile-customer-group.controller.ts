import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  MobileCustomerGroupListDto,
  MobileCustomerGroupResponseDto,
} from '../dto/mobile-customer-group.response.dto';
import { MobileCustomerGroupCreateDto } from '../dto/mobile-customer-group-write.dto';
import { MobileCustomerGroupService } from '../services/mobile-customer-group.service';

/**
 * Danh mục nhóm khách hàng cho app mobile.
 *
 * **Vì sao viết mới thay vì gọi thẳng `/customers/groups` vốn ĐÃ CÓ đủ REST:**
 *
 * 1. Controller đó mang `@RequireBranchScope()` ở cấp class, tức `BranchScopeGuard`
 *    đòi một `branchId` TƯỜNG MINH trong body / param / query / header. Mọi
 *    controller `/mobile/*` chỉ dùng `PermissionGuard`; đi đường kia là mang một
 *    ngoại lệ vào giữa 26 controller đồng khuôn, và app quên gửi `X-Branch-Id`
 *    một lần là 403 khó truy.
 * 2. Nó trả **mảng trần** kèm cả cột hạ tầng (`organizationId`, `branchId`,
 *    `createdBy`, `createdAt`) — phía Dart phải tự lọc, và không có chỗ để thêm
 *    khoá sau này.
 *
 * **KHÔNG có `PATCH`/`DELETE`.** App chỉ CHỌN và TẠO nhanh một nhóm ngay trong
 * form khách hàng; không có màn quản lý danh mục nhóm khách hàng. Dựng sẵn hai
 * đường chưa ai gọi là dựng thứ chưa dùng. Backoffice vẫn sửa/xoá qua
 * `/customers/groups` như cũ.
 *
 * Quyền theo module khách hàng (`customer.read` / `customer.write`), khớp
 * `CustomerController` — picker chỉ mở từ form khách hàng, nơi đã đòi đúng hai
 * quyền này.
 *
 * **CẤM `@Version()`** — `MobileModule` cố ý đứng ngoài versioning.
 */
@ApiTags('mobile')
@Controller('mobile/customer-groups')
@UseGuards(PermissionGuard)
export class MobileCustomerGroupController {
  constructor(private readonly groups: MobileCustomerGroupService) {}

  @Get()
  @RequirePermission('customer.read')
  @ApiOperation({
    summary: 'Trọn danh mục nhóm khách hàng, PHẲNG, không phân trang',
  })
  list(@Actor() actor: ActorContext): Promise<MobileCustomerGroupListDto> {
    return this.groups.list(actor);
  }

  @Post()
  @RequirePermission('customer.write')
  @ApiOperation({ summary: 'Tạo một nhóm khách hàng; mã do server cấp' })
  create(
    @Body() dto: MobileCustomerGroupCreateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCustomerGroupResponseDto> {
    return this.groups.create(dto, actor);
  }
}
