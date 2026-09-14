import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { PartnerProductDetailDto } from '../dto/partner-product-detail.dto';
import {
  PartnerProductSearchDto,
  PartnerProductSearchResponseDto,
} from '../dto/partner-product-search.dto';
import { PARTNER_CATALOG_PERMISSION } from '../partner-catalog.constants';
import { GetPartnerProductQuery } from '../queries/get-partner-product.query';
import { SearchPartnerProductsQuery } from '../queries/search-partner-products.query';

/**
 * Route order matters here. Express 5 matches in registration order, so the
 * static `products/search` must be declared BEFORE the dynamic
 * `products/:productCode`. Today they also differ by HTTP verb so nothing
 * collides, but the day someone adds `GET products/search` the dynamic route
 * would swallow it silently — the same trap documented on
 * inventory-location.module.
 */
@ApiTags('Partner catalog')
@ApiSecurity('api-key')
@Controller('partner/catalog')
@UseGuards(PermissionGuard)
export class PartnerProductV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('products/search')
  @Version('2')
  // A read, not a creation: Nest would default a POST to 201.
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PARTNER_CATALOG_PERMISSION)
  @ApiOperation({
    summary: 'Search products by keyword, category, price and attributes',
  })
  @ApiOkResponse({ type: PartnerProductSearchResponseDto })
  search(
    @Body() dto: PartnerProductSearchDto,
    @Actor() actor: ActorContext,
  ): Promise<PartnerProductSearchResponseDto> {
    return this.queryBus.execute(new SearchPartnerProductsQuery(dto, actor));
  }

  @Get('products/:productCode')
  @Version('2')
  @RequirePermission(PARTNER_CATALOG_PERMISSION)
  @ApiOperation({
    summary: 'Product detail with its attribute dimensions and variants',
  })
  @ApiParam({
    name: 'productCode',
    description:
      'products.code, matched exactly (case-sensitive), ' +
      'not products.id or a variant SKU',
  })
  @ApiOkResponse({ type: PartnerProductDetailDto })
  @ApiNotFoundResponse({
    description:
      'Product not found — unknown code, another organization\'s code, ' +
      'or no active variant. The same response for all three.',
  })
  detail(
    @Param('productCode') productCode: string,
    @Actor() actor: ActorContext,
  ): Promise<PartnerProductDetailDto> {
    return this.queryBus.execute(
      new GetPartnerProductQuery(productCode, actor),
    );
  }
}
