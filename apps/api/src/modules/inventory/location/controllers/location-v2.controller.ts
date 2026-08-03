import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import {
  LocationSearchV2Dto,
  LocationSearchV2ResponseDto,
} from '../dto/location-search-v2.dto';
import { SearchLocationsV2Query } from '../queries/search-locations-v2.query';

@Controller('inventory/locations')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class LocationV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOperation({
    summary: 'Location search with server-side per-column filters',
  })
  @ApiOkResponse({ type: LocationSearchV2ResponseDto })
  search(
    @Body() dto: LocationSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<LocationSearchV2ResponseDto> {
    return this.queryBus.execute(new SearchLocationsV2Query(dto, actor));
  }
}
