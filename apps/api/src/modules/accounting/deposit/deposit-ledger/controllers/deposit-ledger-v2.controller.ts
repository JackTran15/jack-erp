import { Body, Controller, Post, UseGuards, UseInterceptors, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation } from '@nestjs/swagger';
import { DepositLedgerResponse } from '@erp/shared-interfaces';
import {
  Actor,
  ActorContext,
} from '../../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../../auth/decorators';
import { PermissionGuard } from '../../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../../crud/audit.interceptor';
import { DepositLedgerSearchV2Dto } from '../dto/deposit-ledger-search-v2.dto';
import { SearchDepositLedgerV2Query } from '../queries/search-deposit-ledger-v2.query';

/** Resolves to `POST /v2/deposit-ledger/search` (URI versioning is global in main.ts). */
@Controller('deposit-ledger')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositLedgerV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('accounting.deposit_ledger.read')
  @ApiOperation({ summary: 'Search the deposit detail ledger with per-column filters' })
  search(
    @Body() dto: DepositLedgerSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<DepositLedgerResponse> {
    return this.queryBus.execute(new SearchDepositLedgerV2Query(dto, actor));
  }
}
