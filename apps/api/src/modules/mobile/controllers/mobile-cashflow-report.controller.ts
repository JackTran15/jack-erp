import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  MobileCashflowReportQueryDto,
  MobileCashflowStoresQueryDto,
} from '../dto/mobile-cashflow-report.query.dto';
import {
  MobileCashflowStoreListDto,
  MobileCashflowSummaryDto,
} from '../dto/mobile-cashflow-report.response.dto';
import { MobileCashflowReportService } from '../services/mobile-cashflow-report.service';

/**
 * Đúng khoá mà `CashLedgerController` (web "Sổ chi tiết tiền mặt") đòi — cùng
 * dữ liệu, cùng quyền: ai xem được sổ quỹ ở web thì xem được báo cáo này ở
 * app. Không đẻ khoá `reporting.*` mới, vì một khoá mới là mọi role hiện có
 * bị 403 cho tới khi ai đó cấp lại.
 */
const CASH_LEDGER_READ = 'accounting.cash_ledger.read';

/**
 * Phạm vi chi nhánh đi qua `branchIds` trên query (tập PHÂN CÔNG), KHÔNG qua
 * `X-Branch-Id`/`BranchScopeGuard` — cùng lý do `MobileRevenueReportController`.
 */
@ApiTags('mobile')
@Controller('mobile/reports/cashflow')
@UseGuards(PermissionGuard)
export class MobileCashflowReportController {
  constructor(private readonly report: MobileCashflowReportService) {}

  @Get()
  @RequirePermission(CASH_LEDGER_READ)
  @ApiOperation({
    summary:
      'Tình hình thu chi: số dư đầu/cuối kỳ và tổng thu/chi quỹ TIỀN MẶT của các cửa hàng được phân công',
  })
  @ApiOkResponse({ type: MobileCashflowSummaryDto })
  getSummary(
    @Query() query: MobileCashflowReportQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCashflowSummaryDto> {
    return this.report.getSummary(
      { from: query.from, to: query.to, branchIds: query.branchIds },
      actor,
    );
  }

  @Get('stores')
  @RequirePermission(CASH_LEDGER_READ)
  @ApiOperation({
    summary: 'Tiền thu (hoặc chi) theo cửa hàng, mỗi cửa hàng tách theo hạng mục thu/chi',
  })
  @ApiOkResponse({ type: MobileCashflowStoreListDto })
  listStores(
    @Query() query: MobileCashflowStoresQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCashflowStoreListDto> {
    return this.report.listStores(
      { kind: query.kind, from: query.from, to: query.to, branchIds: query.branchIds },
      actor,
    );
  }
}
