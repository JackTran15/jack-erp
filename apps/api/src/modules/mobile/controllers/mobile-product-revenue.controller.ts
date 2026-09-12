import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { REPORT_PERMISSION_KEYS } from '@erp/shared-interfaces';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileProductRevenueQueryDto } from '../dto/mobile-product-revenue.query.dto';
import { MobileProductRevenueService } from '../services/mobile-product-revenue.service';

/**
 * **Doanh thu theo mặt hàng** của người đang đăng nhập.
 *
 * Uỷ quyền cho báo cáo `revenue-by-item` — cùng thứ POS web chạy ở tab cùng tên.
 *
 * **Quyền là khoá THEO BÁO CÁO, không phải khoá sàn của nhóm.** Đường của web
 * mang `@RequirePermission(BRANCH_READ)` ở method rồi để `ReportPermissionGuard`
 * thu hẹp theo `reportType` đọc từ body. Ở đây `reportType` do SERVER đặt và
 * không có trong request, nên guard đó sẽ **rơi thẳng qua** (nó trả `true` khi
 * không thấy `reportType`) — tức khoá theo báo cáo sẽ không được kiểm nếu ta chỉ
 * chép khoá sàn sang.
 *
 * Vì thế method này đòi thẳng `reporting.sales.revenue-by-item.read`. Nó HẸP
 * HƠN khoá sàn, và vai bán hàng có sẵn cả hai (`SALES_PERMISSION_KEYS`).
 *
 * KHÔNG `@Version()` — module mobile chạy `VERSION_NEUTRAL`.
 */
@ApiTags('mobile')
@Controller('mobile/product-revenue')
@UseGuards(PermissionGuard)
export class MobileProductRevenueController {
  constructor(private readonly service: MobileProductRevenueService) {}

  @Get()
  @RequirePermission(REPORT_PERMISSION_KEYS['revenue-by-item']!)
  @ApiOperation({ summary: 'Doanh thu theo mặt hàng — gộp theo mẫu mã hoặc nhóm hàng hóa' })
  @ApiOkResponse({ description: '{ data, total, page, limit } — mỗi dòng là một mẫu mã hoặc một nhóm' })
  list(
    @Query() query: MobileProductRevenueQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.list(query, actor);
  }
}
