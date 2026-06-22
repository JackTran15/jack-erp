import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { CreateGoodsReceiptV2Dto } from '../dto/create-goods-receipt-v2.dto';
import { CreateGoodsReceiptV2Command } from '../commands/create-goods-receipt-v2.command';
import { PostGoodsReceiptV2Command } from '../commands/post-goods-receipt-v2.command';

/** `/v2/goods-receipts` — CQRS command surface for the Nhập kho v2 flow. */
@ApiTags('inventory/goods-receipts')
@Controller('goods-receipts')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class GoodsReceiptCommandV2Controller {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @Version('2')
  @RequirePermission('goods_receipt.post')
  @RequireBranchScope()
  @ApiOperation({ summary: 'Create a DRAFT goods receipt (v2, with Đối tượng)' })
  create(
    @Body() dto: CreateGoodsReceiptV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<{ id: string; documentNumber: string }> {
    return this.commandBus.execute(new CreateGoodsReceiptV2Command(dto, actor));
  }

  @Post(':id/post')
  @Version('2')
  @RequirePermission('goods_receipt.post')
  @RequireBranchScope()
  @ApiOperation({ summary: 'Post a v2 DRAFT goods receipt (DRAFT → POSTED)' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(new PostGoodsReceiptV2Command(id, actor));
  }
}
