import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileRevenueEstimateQueryDto } from '../dto/mobile-revenue-estimate.query.dto';
import { MobileRevenueEstimateResponseDto } from '../dto/mobile-revenue-estimate.response.dto';
import { MobileRevenueEstimateService } from '../services/mobile-revenue-estimate.service';

/**
 * Cùng quyền với Tổng quan và "Doanh thu theo mặt hàng"
 * (`reporting.sales.revenue-by-item.read`), cùng lý do đã ghi ở
 * `MobileOverviewReportController`: bốn trong năm chế độ xem cộng ĐÚNG tập
 * dòng của hai màn đó, nên không có gì để giấu thêm; chế độ thanh toán chỉ
 * bổ dọc lại số tiền của chính các hoá đơn ấy.
 */
const REVENUE_BY_ITEM_READ = 'reporting.sales.revenue-by-item.read';

/**
 * Màn "Doanh thu ước tính" (tab Báo cáo) của app quản lý. CHỈ đọc.
 *
 * Web không có báo cáo tương đương — hai báo cáo gần nhất
 * (`REVENUE_BY_TIME`, `REVENUE_BY_EMPLOYEE`) còn nằm trong comment của
 * `report-type.constant.ts`. Nên đây là đường riêng; công thức và phạm vi
 * mượn của revenue-report, xem service.
 *
 * Không có `BranchScopeGuard` và không đọc `X-Branch-Id`, cùng lý do
 * `MobileInventoryController`: phạm vi là mảng `branchIds` trên query.
 */
@ApiTags('mobile')
@Controller('mobile/reports')
@UseGuards(PermissionGuard)
export class MobileRevenueEstimateController {
  constructor(private readonly report: MobileRevenueEstimateService) {}

  @Get('revenue-estimate')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({
    summary:
      'Doanh thu ước tính: số đơn + doanh thu trong kỳ, gộp theo ngày / trạng thái / thanh toán / nhân viên / kênh',
  })
  @ApiOkResponse({ type: MobileRevenueEstimateResponseDto })
  getRevenueEstimate(
    @Query() query: MobileRevenueEstimateQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileRevenueEstimateResponseDto> {
    return this.report.getReport(
      {
        from: query.from,
        to: query.to,
        branchIds: query.branchIds,
        dateBasis: query.dateBasis,
        groupBy: query.groupBy,
        staffRole: query.staffRole,
      },
      actor,
    );
  }
}
