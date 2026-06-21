import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { CreateStockTransferV2Dto } from '../dto/create-stock-transfer-v2.dto';
import { CreateStockTransferV2Command } from '../commands/create-stock-transfer-v2.command';

/** `/v2/inventory/stock/transfers` — CQRS command surface for the Chuyển kho v2 flow. */
@ApiTags('inventory/stock/transfers')
@Controller('inventory/stock/transfers')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockTransferCommandV2Controller {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @Version('2')
  @RequirePermission('inventory.transfer.create')
  @RequireBranchScope()
  @ApiOperation({
    summary: 'Create + post a stock transfer (v2, per-product uniform source bin)',
  })
  create(
    @Body() dto: CreateStockTransferV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(new CreateStockTransferV2Command(dto, actor));
  }
}
