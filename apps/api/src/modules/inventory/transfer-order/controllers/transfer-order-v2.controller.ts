import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { TransferOrderSearchV2Dto } from '../dto/transfer-order-search-v2.dto';
import { SearchTransferOrdersV2Query } from '../queries/search-transfer-orders-v2.query';

/** `POST /v2/inventory/transfer-orders/search` — server-side CQRS search for the Lệnh điều chuyển list. */
@Controller('inventory/transfer-orders')
@UseGuards(PermissionGuard)
export class TransferOrderV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.transfer.read')
  search(
    @Body() dto: TransferOrderSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchTransferOrdersV2Query(dto, actor));
  }
}
