import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  MobileRevenueItemListQueryDto,
  MobileRevenueReportQueryDto,
  MobileRevenueTimelineQueryDto,
} from '../dto/mobile-revenue-report.query.dto';
import {
  MobileRevenueCategoryItemsDto,
  MobileRevenueCategoryListDto,
  MobileRevenueItemBranchesDto,
  MobileRevenueItemPageDto,
  MobileRevenueItemVariantsDto,
  MobileRevenueTimelineDto,
} from '../dto/mobile-revenue-report.response.dto';
import { MobileRevenueReportService } from '../services/mobile-revenue-report.service';

/**
 * Quyền của báo cáo "Doanh thu theo mặt hàng" — đúng khoá mà
 * `ReportPermissionGuard` của web tra cho `reportType = 'revenue-by-item'`
 * (`REPORT_PERMISSION_KEYS`), để ai xem được ở web thì xem được ở app và
 * ngược lại. Phạm vi chi nhánh (đúng tập phân công) quyết trong service.
 */
const REVENUE_BY_ITEM_READ = 'reporting.sales.revenue-by-item.read';

/**
 * Màn "Doanh thu theo mặt hàng" của app mobile. CHỈ đọc.
 *
 * Sáu `GET` với query phẳng thay vì `POST /reports/invoices/search` với body
 * `{reportType, columns, filters}` của web: đường web trả một bảng cột động
 * cho đúng một grain mỗi lượt, không có chuỗi thời gian theo giờ/thứ, không
 * có doanh thu theo chi nhánh của MỘT mặt hàng — mà màn app cần cả ba. Công
 * thức và điều kiện lọc (loại hoá đơn huỷ, dấu theo `direction`, trừ khuyến
 * mãi engine) thì chép ĐÚNG của web — xem `mobile-revenue-report.sql.ts`.
 *
 * Không có `BranchScopeGuard` và không đọc `X-Branch-Id`, cùng lý do đã ghi ở
 * `MobileInventoryController`: phạm vi là mảng `branchIds` trên query, sàn là
 * phân công của người dùng.
 *
 * Thứ tự khai route: tĩnh (`items`, `categories`, `timeline`) trước động
 * (`items/:id/...`) — Nest khớp theo thứ tự khai.
 */
@ApiTags('mobile')
@Controller('mobile/reports/revenue')
@UseGuards(PermissionGuard)
export class MobileRevenueReportController {
  constructor(private readonly report: MobileRevenueReportService) {}

  @Get('items')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({
    summary:
      'Doanh thu theo mặt hàng (mẫu mã) trong kỳ, phân trang, kèm tổng toàn tập. `search` lọc theo mã/tên mẫu mã và tên nhóm hàng hoá.',
  })
  @ApiOkResponse({ type: MobileRevenueItemPageDto })
  listItems(
    @Query() query: MobileRevenueItemListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileRevenueItemPageDto> {
    // Trường nào cũng chép TAY sang, không `...query`: DTO là bề mặt công khai
    // còn tham số của service là hợp đồng nội bộ, và chép tay thì thêm một khoá
    // vào DTO không lặng lẽ chảy xuống service. Cái giá là phải nhớ thêm dòng
    // ở đây khi DTO có khoá mới — đúng chỗ này, `search`.
    return this.report.listItems(
      {
        from: query.from,
        to: query.to,
        branchIds: query.branchIds,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        search: query.search,
      },
      actor,
    );
  }

  @Get('categories')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({ summary: 'Tỉ trọng doanh thu theo nhóm hàng trong kỳ' })
  @ApiOkResponse({ type: MobileRevenueCategoryListDto })
  listCategories(
    @Query() query: MobileRevenueReportQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileRevenueCategoryListDto> {
    return this.report.listCategories(query, actor);
  }

  @Get('timeline')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({
    summary: 'Doanh thu theo thời gian: giờ / thứ / ngày / tuần / tháng / năm, đủ mốc của kỳ',
  })
  @ApiOkResponse({ type: MobileRevenueTimelineDto })
  getTimeline(
    @Query() query: MobileRevenueTimelineQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileRevenueTimelineDto> {
    return this.report.getTimeline(query, actor);
  }

  /** `ParseUUIDPipe` — cùng lý do mọi `:id` mobile: 400 thay vì 500 cho id rác. */
  @Get('items/:id/branches')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({ summary: 'Doanh thu của một mặt hàng tách theo chi nhánh' })
  @ApiOkResponse({ type: MobileRevenueItemBranchesDto })
  listBranchesOfItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileRevenueReportQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileRevenueItemBranchesDto> {
    return this.report.listBranchesOfItem(id, query, actor);
  }

  @Get('items/:id/variants')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({ summary: 'Doanh thu của một mẫu mã tách theo biến thể' })
  @ApiOkResponse({ type: MobileRevenueItemVariantsDto })
  listVariantsOfItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileRevenueReportQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileRevenueItemVariantsDto> {
    return this.report.listVariantsOfItem(id, query, actor);
  }

  @Get('categories/:id/items')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({ summary: 'Doanh thu của một nhóm hàng tách theo mặt hàng' })
  @ApiOkResponse({ type: MobileRevenueCategoryItemsDto })
  listItemsOfCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileRevenueReportQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileRevenueCategoryItemsDto> {
    return this.report.listItemsOfCategory(id, query, actor);
  }
}
