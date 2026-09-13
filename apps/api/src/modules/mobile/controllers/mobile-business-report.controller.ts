import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileBusinessReportQueryDto } from '../dto/mobile-business-report.query.dto';
import { MobileBusinessReportResponseDto } from '../dto/mobile-business-report.response.dto';
import { MobileBusinessReportService } from '../services/mobile-business-report.service';

/**
 * Báo cáo cho app mobile — hiện có một màn: "Tình hình kinh doanh". CHỈ đọc.
 *
 * `GET` với query phẳng `from`/`to`, không phải `POST /reports/profit/search`
 * với body `{reportType, columns, filters}` của web: đường web trả một bảng
 * P&L hai kỳ cho MỘT phạm vi gộp, còn màn app cần ba con số nhóm theo chi
 * nhánh × tháng. Công thức thì chép đúng của web — xem
 * `MobileBusinessReportService`.
 *
 * Quyền `reporting.profit.read` — sàn của nhóm báo cáo lợi nhuận, Branch
 * Manager có. Phạm vi chi nhánh quyết trong service: đúng tập PHÂN CÔNG,
 * KHÔNG có vế hợp nhất (xem `resolveReportBranchScope`); không có `BranchScopeGuard` và không đọc `X-Branch-Id`, cùng lý do đã ghi ở
 * `MobileInventoryController`.
 */
@ApiTags('mobile')
@Controller('mobile/reports')
@UseGuards(PermissionGuard)
export class MobileBusinessReportController {
  constructor(private readonly report: MobileBusinessReportService) {}

  @Get('business')
  @RequirePermission('reporting.profit.read')
  @ApiOperation({
    summary:
      'Tình hình kinh doanh: doanh thu / chi phí / lợi nhuận theo chi nhánh trong kỳ, kèm 7 tháng để vẽ biểu đồ',
  })
  @ApiOkResponse({ type: MobileBusinessReportResponseDto })
  getBusiness(
    @Query() query: MobileBusinessReportQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileBusinessReportResponseDto> {
    return this.report.getReport({ from: query.from, to: query.to }, actor);
  }
}
