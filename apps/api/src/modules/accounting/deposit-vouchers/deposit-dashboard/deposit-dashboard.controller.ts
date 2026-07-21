import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { DepositDashboardService } from './deposit-dashboard.service';
import { InTransitQueryDto } from './dto/in-transit-query.dto';

/**
 * Read-only GĐ4 reports (FR-07 in-transit report + multi-branch balance
 * dashboard). Deliberately NOT `@RequireBranchScope()` — both reads aggregate
 * across every branch the actor is assigned to (`actor.branchIds`), not a
 * single active `X-Branch-Id`, so BranchScopeGuard stays a no-op here (it only
 * enforces when that decorator is present). No shared URL prefix between the
 * two endpoints, so the controller carries an empty base path.
 */
@Controller()
@UseGuards(PermissionGuard, BranchScopeGuard)
export class DepositDashboardController {
  constructor(private readonly service: DepositDashboardService) {}

  @Get('deposit-transfers/in-transit')
  @RequirePermission('accounting.deposit_dashboard.read')
  inTransit(@Query() query: InTransitQueryDto, @Actor() actor: ActorContext) {
    return this.service.getInTransit(query, actor);
  }

  @Get('deposit/dashboard')
  @RequirePermission('accounting.deposit_dashboard.read')
  dashboard(@Actor() actor: ActorContext) {
    return this.service.getOrgBalance(actor);
  }
}
