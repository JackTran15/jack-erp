import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { GoodsIssueSearchV2Dto } from '../dto/goods-issue-search-v2.dto';
import { SearchGoodsIssuesV2Query } from '../queries/search-goods-issues-v2.query';
import { GoodsIssueLineSearchV2Dto } from '../dto/goods-issue-line-search-v2.dto';
import { SearchGoodsIssueLinesV2Query } from '../queries/search-goods-issue-lines-v2.query';

/**
 * `POST /v2/inventory/goods-issues/search` — server-side CQRS search for the
 * Xuất kho list, and `.../:id/lines/search` for one voucher's line grid.
 *
 * `BranchScopeGuard` is on the class but only bites where `@RequireBranchScope`
 * is declared (it returns true otherwise), so the list search keeps its
 * organization-wide scope while the line search is pinned to a branch.
 */
@Controller('inventory/goods-issues')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class GoodsIssueV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.goods-issue.read')
  search(
    @Body() dto: GoodsIssueSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchGoodsIssuesV2Query(dto, actor));
  }

  /**
   * One page of a voucher's lines, filtered server-side. Route order matters:
   * `search` above is a literal segment and `:id` here is a `ParseUUIDPipe`
   * param, so "search" can never be swallowed as an id.
   */
  @Post(':id/lines/search')
  @Version('2')
  @RequirePermission('inventory.goods-issue.read')
  @RequireBranchScope()
  @ApiOperation({ summary: "Search one goods issue's lines (v2)" })
  searchLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GoodsIssueLineSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(
      new SearchGoodsIssueLinesV2Query(id, dto, actor),
    );
  }
}
