import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileBranchResponseDto } from '../dto/mobile-branch.response.dto';
import { MobileBranchService } from '../services/mobile-branch.service';

/**
 * Cửa hàng (chi nhánh) cho app mobile.
 *
 * Chỉ có MỘT đường: danh sách những cửa hàng người dùng được phép. Không phân
 * trang — một người được gán vào vài chi nhánh, không phải vài trăm; và màn bộ
 * lọc của app vẽ trọn danh sách trong một lượt cuộn, không có ô tìm kiếm.
 *
 * **KHÔNG có `@RequirePermission`**, và đó là chủ ý chứ không phải bỏ sót: đây
 * là danh sách của CHÍNH người gọi, suy ra từ bảng phân công của họ. Route
 * tương đương ở backoffice (`GET /branches/me`) cũng không khai quyền nào —
 * bắt một quyền ở đây nghĩa là có tài khoản đăng nhập được nhưng không biết
 * mình đang đứng ở cửa hàng nào.
 */
@ApiTags('mobile')
@Controller('mobile/branches')
@UseGuards(PermissionGuard)
export class MobileBranchController {
  constructor(private readonly branches: MobileBranchService) {}

  @Get()
  @ApiOperation({ summary: 'Cửa hàng mà người dùng được phép làm việc' })
  @ApiOkResponse({ type: [MobileBranchResponseDto] })
  listMine(@Actor() actor: ActorContext): Promise<MobileBranchResponseDto[]> {
    return this.branches.listMine(actor);
  }
}
