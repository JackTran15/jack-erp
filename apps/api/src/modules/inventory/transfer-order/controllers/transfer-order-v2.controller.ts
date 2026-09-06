import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Version,
} from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { ApiOperation } from "@nestjs/swagger";
import {
  Actor,
  ActorContext,
} from "../../../../common/decorators/actor-context.decorator";
import { RequirePermission } from "../../../auth/decorators";
import { PermissionGuard } from "../../../rbac/permission.guard";
import { GoodsIssueLineSearchV2Dto } from "../../goods-issue/dto/goods-issue-line-search-v2.dto";
import { SearchGoodsIssueLinesV2Query } from "../../goods-issue/queries/search-goods-issue-lines-v2.query";
import { GoodsReceiptLineSearchV2Dto } from "../../goods-receipt/dto/goods-receipt-line-search-v2.dto";
import { SearchGoodsReceiptLinesV2Query } from "../../goods-receipt/queries/search-goods-receipt-lines-v2.query";
import { TransferOrderService } from "../transfer-order.service";

/**
 * Line grids for the two documents of a transfer, addressed by the transfer
 * order rather than by the document — the cross-branch siblings of
 * `POST /v2/inventory/goods-issues/:id/lines/search` and
 * `POST /v2/goods-receipts/:id/lines/search`.
 *
 * Those two are branch-scoped, and each document of a transfer belongs to the
 * *other* branch: the XK to the source, the NK to the destination. So the
 * destination branch opening the source's XK on "Điều chuyển từ cửa hàng khác"
 * gets a 404 from them and the detail grid renders empty. The header routes
 * next door (`GET :id/export-goods-issue`, `GET :id/import-goods-receipt`)
 * already solve this the same way: resolve through the transfer order, which
 * authorizes the actor's branch as a participant, then read the document
 * org-scoped.
 */
@Controller("inventory/transfer-orders")
@UseGuards(PermissionGuard)
export class TransferOrderV2Controller {
  constructor(
    private readonly service: TransferOrderService,
    private readonly queryBus: QueryBus,
  ) {}

  @Post(":id/export-goods-issue/lines/search")
  @Version("2")
  @RequirePermission("inventory.transfer.read")
  @ApiOperation({
    summary: "Search the lines of a transfer's export goods issue (v2)",
  })
  async searchExportGoodsIssueLines(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GoodsIssueLineSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    // Resolving through the service is what authorizes this: it 404s unless the
    // actor's branch is the source or the destination of the transfer.
    const issue = await this.service.getExportGoodsIssue(id, actor);
    return this.queryBus.execute(
      new SearchGoodsIssueLinesV2Query(issue.id, dto, actor, true),
    );
  }

  @Post(":id/import-goods-receipt/lines/search")
  @Version("2")
  @RequirePermission("inventory.transfer.read")
  @ApiOperation({
    summary: "Search the lines of a transfer's import goods receipt (v2)",
  })
  async searchImportGoodsReceiptLines(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GoodsReceiptLineSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    const receipt = await this.service.getImportGoodsReceipt(id, actor);
    return this.queryBus.execute(
      new SearchGoodsReceiptLinesV2Query(receipt.id, dto, actor, true),
    );
  }
}
