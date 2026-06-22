import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import {
  ResolveItemLocationsDto,
  ResolveItemLocationsResponseDto,
} from '../dto/resolve-item-locations.dto';
import { ResolveItemLocationsQuery } from '../queries/resolve-item-locations.query';

@ApiTags('inventory/items')
@Controller('inventory/items')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class ResolveItemLocationsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('resolve-locations')
  @Version('2')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOperation({
    summary:
      'Resolve a suggested location per variant for a branch (or explicit storage)',
  })
  @ApiOkResponse({ type: ResolveItemLocationsResponseDto })
  resolve(
    @Body() dto: ResolveItemLocationsDto,
    @Actor() actor: ActorContext,
  ): Promise<ResolveItemLocationsResponseDto> {
    return this.queryBus.execute(new ResolveItemLocationsQuery(dto, actor));
  }
}
