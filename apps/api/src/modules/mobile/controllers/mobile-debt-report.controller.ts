import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  MobileCustomerDebtListQueryDto,
  MobileCustomerDebtSort,
} from '../dto/mobile-debt-report.query.dto';
import { MobileCustomerDebtPageDto } from '../dto/mobile-debt-report.response.dto';
import { MobileCustomerOrder } from '../dto/mobile-customer-list.query.dto';
import { MobileDebtReportService } from '../services/mobile-debt-report.service';

/**
 * Quyền của báo cáo "Công nợ khách hàng" — đúng khoá mà `ReportPermissionGuard`
 * của web tra cho `reportType = 'customer-debts'` (`REPORT_PERMISSION_KEYS`),
 * để ai xem được ở web thì xem được ở app. Phạm vi chi nhánh quyết trong
 * service.
 */
const CUSTOMER_DEBTS_READ = 'reporting.debts.customer-debts.read';

/**
 * Màn "Công nợ khách hàng" của app mobile. CHỈ đọc.
 *
 * Một `GET` với query phẳng thay vì `POST /reports/debts/search` của web —
 * lý do ở `MobileDebtReportService`. Prefix `mobile/reports/debts` để báo cáo
 * công nợ nhà cung cấp, khi có, đứng cạnh (`debts/suppliers`).
 *
 * Không có `BranchScopeGuard` và không đọc `X-Branch-Id`, cùng lý do đã ghi ở
 * `MobileRevenueReportController`.
 */
@ApiTags('mobile')
@Controller('mobile/reports/debts')
@UseGuards(PermissionGuard)
export class MobileDebtReportController {
  constructor(private readonly report: MobileDebtReportService) {}

  @Get('customers')
  @RequirePermission(CUSTOMER_DEBTS_READ)
  @ApiOperation({
    summary:
      'Công nợ khách hàng: nợ cuối kỳ từng khách (sổ POS + sổ kế toán), phân trang, kèm tổng toàn tập',
  })
  @ApiOkResponse({ type: MobileCustomerDebtPageDto })
  listCustomers(
    @Query() query: MobileCustomerDebtListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCustomerDebtPageDto> {
    return this.report.listCustomers(
      {
        from: query.from,
        to: query.to,
        branchIds: query.branchIds,
        search: query.search,
        sort: query.sort ?? MobileCustomerDebtSort.NAME,
        order: query.order ?? MobileCustomerOrder.ASC,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      actor,
    );
  }
}
