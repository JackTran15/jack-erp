import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { DepositAuditService, ListAuditQuery } from './deposit-audit.service';

@Controller('deposit-audit-log')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositAuditController {
  constructor(private readonly audit: DepositAuditService) {}

  @Get()
  @RequirePermission('accounting.deposit_audit.read')
  list(@Query() query: ListAuditQuery, @Actor() actor: ActorContext) {
    return this.audit.list(query, actor);
  }
}
