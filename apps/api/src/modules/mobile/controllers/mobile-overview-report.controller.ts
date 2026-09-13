import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileOverviewReportQueryDto } from '../dto/mobile-overview-report.query.dto';
import { MobileOverviewReportResponseDto } from '../dto/mobile-overview-report.response.dto';
import { MobileOverviewReportService } from '../services/mobile-overview-report.service';

/**
 * Quyền của màn Tổng quan = quyền của "Doanh thu theo mặt hàng"
 * (`reporting.sales.revenue-by-item.read`), CÓ CHỦ Ý: hai màn hiện CÙNG một
 * con số (cùng CTE, cùng điều kiện), nên ai xem được màn kia thì không có gì
 * để giấu ở màn này. Một khoá riêng là thêm một dòng seed + migration quyền
 * để đổi lấy một ranh giới không tồn tại.
 */
const REVENUE_BY_ITEM_READ = 'reporting.sales.revenue-by-item.read';

/**
 * Màn "Tổng quan" (tab đầu) của app quản lý. CHỈ đọc.
 *
 * Web không có màn tương đương: `/reports/dashboard` cũ đọc `pos_sales` —
 * bảng không còn ai ghi — và không có kỳ so sánh lẫn phân rã chi nhánh. Nên
 * đây là một đường riêng, công thức mượn của revenue-report (xem service).
 *
 * Không có `BranchScopeGuard` và không đọc `X-Branch-Id`, cùng lý do đã ghi ở
 * `MobileInventoryController`: phạm vi là mảng `branchIds` trên query.
 */
@ApiTags('mobile')
@Controller('mobile/reports')
@UseGuards(PermissionGuard)
export class MobileOverviewReportController {
  constructor(private readonly report: MobileOverviewReportService) {}

  @Get('overview')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({
    summary:
      'Tổng quan: doanh thu + số hoá đơn theo chi nhánh trong kỳ, kèm doanh thu kỳ so sánh',
  })
  @ApiOkResponse({ type: MobileOverviewReportResponseDto })
  getOverview(
    @Query() query: MobileOverviewReportQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileOverviewReportResponseDto> {
    return this.report.getReport(
      {
        from: query.from,
        to: query.to,
        branchIds: query.branchIds,
        compareFrom: query.compareFrom,
        compareTo: query.compareTo,
      },
      actor,
    );
  }
}
