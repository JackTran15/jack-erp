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
  SearchItemCategoryTreeDto,
  SearchItemCategoryTreeResponseDto,
} from '../dto/search-item-category-tree.dto';
import { SearchItemCategoryTreeQuery } from '../queries/search-item-category-tree.query';

@ApiTags('inventory/item-categories')
@Controller('inventory/item-categories')
@UseGuards(PermissionGuard)
export class ItemCategoryTreeController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('tree')
  @Version('2')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List item categories as a parent → child tree' })
  @ApiOkResponse({ type: SearchItemCategoryTreeResponseDto })
  tree(
    @Body() dto: SearchItemCategoryTreeDto,
    @Actor() actor: ActorContext,
  ): Promise<SearchItemCategoryTreeResponseDto> {
    return this.queryBus.execute(new SearchItemCategoryTreeQuery(dto, actor));
  }
}
