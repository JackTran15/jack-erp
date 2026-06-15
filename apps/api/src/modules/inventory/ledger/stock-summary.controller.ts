import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { StockSummaryService } from './stock-summary.service';
import { StockSummaryQueryDto } from './dto/stock-summary-query.dto';
import { StockSummaryDetailsQueryDto } from './dto/stock-summary-details-query.dto';

@ApiTags('inventory')
@Controller('inventory/stock')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class StockSummaryController {
  constructor(private readonly service: StockSummaryService) {}

  @Get('summary')
  @RequirePermission('inventory.read')
  getSummary(
    @Query() query: StockSummaryQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getSummary({
      ...query,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
    });
  }

  @Get('summary/filter-options')
  @RequirePermission('inventory.read')
  getFilterOptions(@Actor() actor: ActorContext) {
    return this.service.getFilterOptions(actor.organizationId);
  }

  @Get('summary/details')
  @RequirePermission('inventory.read')
  getDetails(
    @Query() query: StockSummaryDetailsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getDetails({
      ...query,
      organizationId: actor.organizationId,
      branchId: actor.branchId!,
    });
  }
}
