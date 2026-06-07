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
  ProductSearchV2Dto,
  ProductSearchV2ResponseDto,
} from '../dto/product-search-v2.dto';
import { SearchProductsV2Query } from '../queries/search-products-v2.query';

@Controller('products')
@UseGuards(PermissionGuard)
export class ProductV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('product.read')
  @ApiOperation({
    summary: 'Variant-grouped product search (server-side filters)',
  })
  @ApiOkResponse({ type: ProductSearchV2ResponseDto })
  search(
    @Body() dto: ProductSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<ProductSearchV2ResponseDto> {
    return this.queryBus.execute(new SearchProductsV2Query(dto, actor));
  }
}
