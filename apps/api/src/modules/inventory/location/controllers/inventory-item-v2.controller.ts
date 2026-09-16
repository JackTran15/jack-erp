import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
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
import {
  ProductImageSearchDto,
  ProductImageSearchResponseDto,
} from '../dto/product-image-search.dto';
import {
  ResolveImageNamesDto,
  ResolveImageNamesResponseDto,
} from '../dto/resolve-image-names.dto';
import { ResolveImageNamesQuery } from '../queries/resolve-image-names.query';
import { SearchInventoryItemsV2Query } from '../queries/search-inventory-items-v2.query';
import { SearchProductImagesQuery } from '../queries/search-product-images.query';

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

  @Post('images/search')
  @Version('2')
  @HttpCode(200)
  @RequirePermission('inventory.read')
  @ApiOperation({
    summary:
      'Product-grouped search by image status, category subtree and keyword (Update images page)',
  })
  @ApiOkResponse({ type: ProductImageSearchResponseDto })
  searchImages(
    @Body() dto: ProductImageSearchDto,
    @Actor() actor: ActorContext,
  ): Promise<ProductImageSearchResponseDto> {
    return this.queryBus.execute(new SearchProductImagesQuery(dto, actor));
  }

  @Post('resolve-image-names')
  @Version('2')
  @HttpCode(200)
  @RequirePermission('inventory.read')
  @ApiOperation({
    summary:
      'Split dropped image file names into code + sequence and resolve each to its product/item owner (Quick image update page)',
  })
  @ApiOkResponse({ type: ResolveImageNamesResponseDto })
  resolveImageNames(
    @Body() dto: ResolveImageNamesDto,
    @Actor() actor: ActorContext,
  ): Promise<ResolveImageNamesResponseDto> {
    return this.queryBus.execute(new ResolveImageNamesQuery(dto, actor));
  }
}
