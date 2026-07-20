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
  DepositVoucherSearchV2Dto,
  DepositVoucherSearchV2ResponseDto,
} from '../dto/deposit-voucher-search-v2.dto';
import { SearchDepositVouchersV2Query } from '../queries/search-deposit-vouchers-v2.query';

/**
 * Resolves to `POST /v2/deposit-vouchers/search` (URI versioning is global in
 * main.ts). One endpoint over both voucher tables, replacing the two separate
 * list calls the treasury grid used to merge client-side.
 */
@Controller('deposit-vouchers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositVoucherV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  // Reuses the receipt read permission rather than introducing a new key, which
  // would 403 every existing role until RBAC granted it.
  @RequirePermission('accounting.bank_receipt.read')
  @ApiOperation({ summary: 'Search deposit receipts and payments as one list' })
  @ApiOkResponse({ type: DepositVoucherSearchV2ResponseDto })
  search(
    @Body() dto: DepositVoucherSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<DepositVoucherSearchV2ResponseDto> {
    return this.queryBus.execute(new SearchDepositVouchersV2Query(dto, actor));
  }
}
