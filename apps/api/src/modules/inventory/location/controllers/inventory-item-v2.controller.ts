import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import {
  InventoryItemSearchV2Dto,
  InventoryItemSearchV2ResponseDto,
} from '../dto/inventory-item-search-v2.dto';
import { SearchInventoryItemsV2Query } from '../queries/search-inventory-items-v2.query';

@Controller('inventory-items')
@UseGuards(PermissionGuard)
export class InventoryItemV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.read')
  @ApiOperation({
    summary: 'Product-grouped inventory item search (server-side filters)',
  })
  @ApiOkResponse({ type: InventoryItemSearchV2ResponseDto })
  search(
    @Body() dto: InventoryItemSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<InventoryItemSearchV2ResponseDto> {
    return this.queryBus.execute(new SearchInventoryItemsV2Query(dto, actor));
  }
}
