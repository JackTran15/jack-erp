import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import {
  OverviewProductProfitQueryDto,
  OverviewProductShareQueryDto,
  OverviewRangeQueryDto,
  OverviewTimelineQueryDto,
  OverviewTopProductsQueryDto,
} from './dto/overview-report.query.dto';
import {
  OverviewCashFlowResponseDto,
  OverviewDailyActivityResponseDto,
  OverviewProductProfitResponseDto,
  OverviewRevenueCostProfitResponseDto,
  OverviewRevenueCostProfitTimelineResponseDto,
  OverviewRevenueTimelineResponseDto,
  OverviewSubjectListResponseDto,
} from './dto/overview-report.response.dto';
import { OverviewReportService } from './overview-report.service';

/**
 * Quyền chép đúng endpoint mobile tương ứng — cùng dữ liệu, cùng khoá, không
 * đẻ khoá mới (một khoá mới là mọi role hiện có bị 403):
 * doanh thu ≡ `MobileRevenueReportController`, KQKD ≡
 * `MobileBusinessReportController`, quỹ ≡ `MobileCashflowReportController`.
 */
const REVENUE_BY_ITEM_READ = 'reporting.sales.revenue-by-item.read';
const PROFIT_READ = 'reporting.profit.read';
const CASH_LEDGER_READ = 'accounting.cash_ledger.read';

/**
 * Trang "Tổng quan" của backoffice. CHỈ đọc.
 *
 * Phạm vi chi nhánh đi qua `branchIds` trên query (tập PHÂN CÔNG), KHÔNG qua
 * `X-Branch-Id`/`BranchScopeGuard` — header vẫn trỏ chi nhánh cũ khi web ở
 * chế độ "Chuỗi cửa hàng", nên client gửi tường minh: một chi nhánh → một id,
 * chuỗi → vắng (mọi chi nhánh phân công).
 */
@ApiTags('reports-overview')
@Controller('reports/overview')
@UseGuards(PermissionGuard)
export class OverviewReportController {
  constructor(private readonly report: OverviewReportService) {}

  @Get('daily-activity')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({ summary: 'Hoạt động trong kỳ: tiền thu, doanh thu đã/chưa thanh toán, hoá đơn huỷ' })
  @ApiOkResponse({ type: OverviewDailyActivityResponseDto })
  getDailyActivity(
    @Query() query: OverviewRangeQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<OverviewDailyActivityResponseDto> {
    return this.report.getDailyActivity(query, actor);
  }

  @Get('revenue-cost-profit')
  @RequirePermission(PROFIT_READ)
  @ApiOperation({ summary: 'Doanh thu, chi phí, lợi nhuận theo cửa hàng (công thức KQKD)' })
  @ApiOkResponse({ type: OverviewRevenueCostProfitResponseDto })
  getRevenueCostProfit(
    @Query() query: OverviewRangeQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<OverviewRevenueCostProfitResponseDto> {
    return this.report.getRevenueCostProfit(query, actor);
  }

  @Get('cash-flow')
  @RequirePermission(CASH_LEDGER_READ)
  @ApiOperation({ summary: 'Thu/chi quỹ tiền mặt theo mốc thời gian' })
  @ApiOkResponse({ type: OverviewCashFlowResponseDto })
  getCashFlow(
    @Query() query: OverviewTimelineQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<OverviewCashFlowResponseDto> {
    return this.report.getCashFlow(query, actor);
  }

  @Get('revenue-timeline')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({ summary: 'Doanh thu theo mốc thời gian' })
  @ApiOkResponse({ type: OverviewRevenueTimelineResponseDto })
  getRevenueTimeline(
    @Query() query: OverviewTimelineQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<OverviewRevenueTimelineResponseDto> {
    return this.report.getRevenueTimeline(query, actor);
  }

  @Get('revenue-cost-profit-timeline')
  @RequirePermission(PROFIT_READ)
  @ApiOperation({ summary: 'Doanh thu, chi phí, lợi nhuận theo tháng (công thức KQKD)' })
  @ApiOkResponse({ type: OverviewRevenueCostProfitTimelineResponseDto })
  getRevenueCostProfitTimeline(
    @Query() query: OverviewRangeQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<OverviewRevenueCostProfitTimelineResponseDto> {
    return this.report.getRevenueCostProfitTimeline(query, actor);
  }

  @Get('product-profit')
  @RequirePermission(PROFIT_READ)
  @ApiOperation({ summary: 'Doanh thu, giá vốn, lợi nhuận hàng hoá theo mốc thời gian' })
  @ApiOkResponse({ type: OverviewProductProfitResponseDto })
  getProductProfit(
    @Query() query: OverviewProductProfitQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<OverviewProductProfitResponseDto> {
    return this.report.getProductProfit(query, actor);
  }

  @Get('product-share')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({ summary: 'Doanh thu gộp theo nhóm hàng / mẫu mã / hàng hoá' })
  @ApiOkResponse({ type: OverviewSubjectListResponseDto })
  getProductShare(
    @Query() query: OverviewProductShareQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<OverviewSubjectListResponseDto> {
    return this.report.getProductShare(query, actor);
  }

  @Get('top-products')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({ summary: 'Hàng hoá bán chạy theo doanh thu hoặc số lượng' })
  @ApiOkResponse({ type: OverviewSubjectListResponseDto })
  getTopProducts(
    @Query() query: OverviewTopProductsQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<OverviewSubjectListResponseDto> {
    return this.report.getTopProducts(query, actor);
  }
}
