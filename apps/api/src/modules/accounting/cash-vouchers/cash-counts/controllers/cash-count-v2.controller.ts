import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../../../common/decorators/actor-context.decorator';
import {
  RequireBranchScope,
  RequirePermission,
} from '../../../../auth/decorators';
import { BranchScopeGuard } from '../../../../rbac/branch-scope.guard';
import { PermissionGuard } from '../../../../rbac/permission.guard';
import { CashCountSearchV2Dto } from '../dto/cash-count-search-v2.dto';
import { SearchCashCountsV2Query } from '../queries/search-cash-counts-v2.query';

@Controller('cash-counts')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashCountV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('accounting.cash_count.read')
  search(
    @Body() dto: CashCountSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchCashCountsV2Query(dto, actor));
  }
}
