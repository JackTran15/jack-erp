import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  PartnerProductSearchDto,
  PartnerProductSearchResponseDto,
} from '../dto/partner-product-search.dto';
import { PARTNER_CATALOG_PERMISSION } from '../partner-catalog.constants';
import { SearchPartnerProductsQuery } from '../queries/search-partner-products.query';

/**
 * Route order matters here. Express 5 matches in registration order, so the
 * static `products/search` must be declared BEFORE any dynamic
 * `products/:productId`. Today they differ by HTTP verb so nothing collides,
 * but the day someone adds `GET products/search` the dynamic route would
 * swallow it silently — the same trap documented on inventory-location.module.
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
}
