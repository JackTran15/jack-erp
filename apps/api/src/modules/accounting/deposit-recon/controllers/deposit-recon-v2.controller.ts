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
  DepositReconSearchV2Dto,
  DepositReconSearchV2ResponseDto,
} from '../dto/deposit-recon-search-v2.dto';
import { SearchDepositReconV2Query } from '../queries/search-deposit-recon-v2.query';

/** Resolves to `POST /v2/deposit-recon/search` (URI versioning is global in main.ts). */
@Controller('deposit-recon')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositReconV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('accounting.deposit_recon.read')
  @ApiOperation({ summary: 'Search deposit movements for reconciliation' })
  @ApiOkResponse({ type: DepositReconSearchV2ResponseDto })
  search(
    @Body() dto: DepositReconSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<DepositReconSearchV2ResponseDto> {
    return this.queryBus.execute(new SearchDepositReconV2Query(dto, actor));
  }
}
