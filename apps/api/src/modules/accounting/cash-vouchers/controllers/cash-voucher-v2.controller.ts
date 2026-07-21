import { Body, Controller, Post, UseGuards, UseInterceptors, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import {
  CashVoucherSearchV2Dto,
  CashVoucherSearchV2ResponseDto,
} from '../dto/cash-voucher-search-v2.dto';
import { SearchCashVouchersV2Query } from '../queries/search-cash-vouchers-v2.query';

/**
 * Resolves to `POST /v2/cash-vouchers/search` (URI versioning is global in
 * main.ts). One endpoint over both voucher tables, replacing the two separate
 * list calls the treasury grid used to merge client-side.
 */
@Controller('cash-vouchers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashVoucherV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  // Reuses the receipt read permission rather than introducing a new key, which
  // would 403 every existing role until RBAC granted it.
  @RequirePermission('accounting.cash_receipt.read')
  @ApiOperation({ summary: 'Search cash receipts and payments as one list' })
  @ApiOkResponse({ type: CashVoucherSearchV2ResponseDto })
  search(
    @Body() dto: CashVoucherSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<CashVoucherSearchV2ResponseDto> {
    return this.queryBus.execute(new SearchCashVouchersV2Query(dto, actor));
  }
}
