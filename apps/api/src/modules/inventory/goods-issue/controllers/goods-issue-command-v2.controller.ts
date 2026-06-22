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
import { CreateGoodsIssueV2Dto } from '../dto/create-goods-issue-v2.dto';
import { CreateGoodsIssueV2Command } from '../commands/create-goods-issue-v2.command';
import { PostGoodsIssueV2Command } from '../commands/post-goods-issue-v2.command';

/** `/v2/inventory/goods-issues` — CQRS command surface for the Xuất kho v2 flow. */
@ApiTags('inventory/goods-issues')
@Controller('inventory/goods-issues')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class GoodsIssueCommandV2Controller {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @Version('2')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  @ApiOperation({ summary: 'Create a DRAFT goods issue (v2, with Đối tượng)' })
  create(
    @Body() dto: CreateGoodsIssueV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<{ id: string; documentNumber: string | null }> {
    return this.commandBus.execute(new CreateGoodsIssueV2Command(dto, actor));
  }

  @Post(':id/post')
  @Version('2')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  @ApiOperation({ summary: 'Post a v2 DRAFT goods issue (DRAFT → POSTED)' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(new PostGoodsIssueV2Command(id, actor));
  }
}
