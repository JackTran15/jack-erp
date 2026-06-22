import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import {
  SearchProductGroupsDto,
  SearchProductGroupsResponseDto,
} from '../dto/search-product-groups.dto';
import { SearchProductGroupsQuery } from '../queries/search-product-groups.query';

@ApiTags('inventory/product-groups')
@Controller('inventory/product-groups')
@UseGuards(PermissionGuard)
export class ProductGroupSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.read')
  @ApiOperation({
    summary: 'Search products grouped as category → model → variant',
  })
  @ApiOkResponse({ type: SearchProductGroupsResponseDto })
  search(
    @Body() dto: SearchProductGroupsDto,
    @Actor() actor: ActorContext,
  ): Promise<SearchProductGroupsResponseDto> {
    return this.queryBus.execute(new SearchProductGroupsQuery(dto, actor));
  }
}
