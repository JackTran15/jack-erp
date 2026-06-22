import {
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
import { SetDefaultReceivingWarehouseCommand } from '../commands/set-default-receiving-warehouse.command';

@ApiTags('inventory/storages')
@Controller('inventory/storages')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StorageDefaultReceivingController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post(':id/set-default-receiving')
  @Version('2')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  @ApiOperation({
    summary:
      "Set a storage as the active branch's single default receiving warehouse",
  })
  setDefaultReceiving(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<{ storageId: string }> {
    return this.commandBus.execute(
      new SetDefaultReceivingWarehouseCommand(id, actor),
    );
  }
}
