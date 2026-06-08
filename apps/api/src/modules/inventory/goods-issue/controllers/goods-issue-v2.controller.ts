import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { GoodsIssueSearchV2Dto } from '../dto/goods-issue-search-v2.dto';
import { SearchGoodsIssuesV2Query } from '../queries/search-goods-issues-v2.query';

/** `POST /v2/inventory/goods-issues/search` — server-side CQRS search for the Xuất kho list. */
@Controller('inventory/goods-issues')
@UseGuards(PermissionGuard)
export class GoodsIssueV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.read')
  search(
    @Body() dto: GoodsIssueSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchGoodsIssuesV2Query(dto, actor));
  }
}
