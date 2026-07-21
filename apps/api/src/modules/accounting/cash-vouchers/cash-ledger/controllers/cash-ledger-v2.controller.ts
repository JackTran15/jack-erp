import { Body, Controller, Post, UseGuards, UseInterceptors, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../../auth/decorators';
import { PermissionGuard } from '../../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../../crud/audit.interceptor';
import { CashLedgerResult } from '../cash-ledger.service';
import { CashLedgerSearchV2Dto } from '../dto/cash-ledger-search-v2.dto';
import { SearchCashLedgerV2Query } from '../queries/search-cash-ledger-v2.query';

/** Resolves to `POST /v2/cash-ledger/search` (URI versioning is global in main.ts). */
@Controller('cash-ledger')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashLedgerV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('accounting.cash_ledger.read')
  @ApiOperation({ summary: 'Search the cash detail ledger with per-column filters' })
  search(
    @Body() dto: CashLedgerSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<CashLedgerResult> {
    return this.queryBus.execute(new SearchCashLedgerV2Query(dto, actor));
  }
}
