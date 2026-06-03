import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { GoodsReceiptSearchV2Dto } from '../dto/goods-receipt-search-v2.dto';
import { SearchGoodsReceiptsV2Query } from '../queries/search-goods-receipts-v2.query';

/** `POST /v2/goods-receipts/search` — server-side CQRS search for the Nhập kho list. */
@Controller('goods-receipts')
@UseGuards(PermissionGuard)
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
}
