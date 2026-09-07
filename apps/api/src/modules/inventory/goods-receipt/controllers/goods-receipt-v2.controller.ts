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
import { GoodsReceiptSearchV2Dto } from '../dto/goods-receipt-search-v2.dto';
import { SearchGoodsReceiptsV2Query } from '../queries/search-goods-receipts-v2.query';
import { GoodsReceiptLineSearchV2Dto } from '../dto/goods-receipt-line-search-v2.dto';
import { SearchGoodsReceiptLinesV2Query } from '../queries/search-goods-receipt-lines-v2.query';

/**
 * `POST /v2/goods-receipts/search` — server-side CQRS search for the Nhập kho
 * list, and `.../:id/lines/search` for one voucher's line grid.
 *
 * `BranchScopeGuard` is on the class but only bites where `@RequireBranchScope`
 * is declared (it returns true otherwise), so the list search keeps its
 * organization-wide scope while the line search is pinned to a branch.
 */
@Controller('goods-receipts')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class GoodsReceiptV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('goods_receipt.read')
  search(
    @Body() dto: GoodsReceiptSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchGoodsReceiptsV2Query(dto, actor));
  }

  /**
   * One page of a voucher's lines, filtered server-side. Route order matters:
   * `search` above is a literal segment and `:id` here is a `ParseUUIDPipe`
   * param, so "search" can never be swallowed as an id.
   */
  @Post(':id/lines/search')
  @Version('2')
  @RequirePermission('goods_receipt.read')
  @RequireBranchScope()
  @ApiOperation({ summary: "Search one goods receipt's lines (v2)" })
  searchLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GoodsReceiptLineSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(
      new SearchGoodsReceiptLinesV2Query(id, dto, actor),
    );
  }
}
