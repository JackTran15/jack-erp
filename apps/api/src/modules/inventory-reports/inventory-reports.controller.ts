import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import { BranchScopeGuard } from '../rbac/branch-scope.guard';
import { InventoryReportsService } from './inventory-reports.service';
import { InventoryReportQueryDto } from './dto/inventory-report-query.dto';
import { TransferByBranchQueryDto } from './dto/transfer-by-branch-query.dto';

/**
 * Inventory report endpoints. Reads are organization-scoped and may
 * aggregate across branches (filter via `branchIds` query param) — so
 * we deliberately do NOT apply `@RequireBranchScope()` at the class
 * level (which would force an `X-Branch-Id` header).
 *
 * `AuthGuard` is applied globally via `APP_GUARD` in `CommonModule`,
 * so we only need to declare `PermissionGuard` and `BranchScopeGuard`
 * here to enable the permission / branch-scope decorators.
 */
@ApiTags('inventory-reports')
@Controller('reports/inventory')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class InventoryReportsController {
  constructor(private readonly service: InventoryReportsService) {}

  @Get('stock-summary')
  @RequirePermission('inventory.reports.read')
  @ApiOperation({ summary: 'Tổng hợp nhập xuất tồn kho' })
  stockSummary(
    @Actor() actor: ActorContext,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.service.stockSummary(actor, query);
  }

  @Get('stock-document-details')
  @RequirePermission('inventory.reports.read')
  @ApiOperation({ summary: 'Bảng kê chi tiết phiếu nhập xuất' })
  stockDocumentDetails(
    @Actor() actor: ActorContext,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.service.stockDocumentDetails(actor, query);
  }

  @Get('stock-quantity-details')
  @RequirePermission('inventory.reports.read')
  @ApiOperation({ summary: 'Chi tiết số lượng nhập xuất tồn' })
  stockQuantityDetails(
    @Actor() actor: ActorContext,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.service.stockQuantityDetails(actor, query);
  }

  @Get('stock-summary-by-branch')
  @RequirePermission('inventory.reports.read')
  @ApiOperation({ summary: 'Tổng hợp nhập xuất tồn theo cửa hàng' })
  stockSummaryByBranch(
    @Actor() actor: ActorContext,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.service.stockSummaryByBranch(actor, query);
  }

  @Get('stock-by-branch')
  @RequirePermission('inventory.reports.read')
  @ApiOperation({ summary: 'Số lượng tồn theo cửa hàng (pivot)' })
  stockByBranch(
    @Actor() actor: ActorContext,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.service.stockByBranch(actor, query);
  }

  @Get('temporary-warehouse-out-goods')
  @RequirePermission('inventory.reports.read')
  @ApiOperation({ summary: 'Hàng hóa xuất kho tạm' })
  temporaryWarehouseOutGoods(
    @Actor() actor: ActorContext,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.service.temporaryWarehouseOutGoods(actor, query);
  }

  @Get('transfer-summary')
  @RequirePermission('inventory.reports.read')
  @ApiOperation({ summary: 'Tổng hợp nhập xuất điều chuyển' })
  transferSummary(
    @Actor() actor: ActorContext,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.service.transferSummary(actor, query);
  }

  @Get('transfer-by-branch')
  @RequirePermission('inventory.reports.read')
  @ApiOperation({ summary: 'Hàng hóa điều chuyển theo cửa hàng' })
  transferByBranch(
    @Actor() actor: ActorContext,
    @Query() query: TransferByBranchQueryDto,
  ) {
    return this.service.transferByBranch(actor, query);
  }
}
