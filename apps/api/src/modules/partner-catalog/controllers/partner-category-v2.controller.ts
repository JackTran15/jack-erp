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
  PartnerCategoryTreeRequestDto,
  PartnerCategoryTreeResponseDto,
} from '../dto/partner-category-tree.dto';
import { PARTNER_CATALOG_PERMISSION } from '../partner-catalog.constants';
import { SearchPartnerCategoriesQuery } from '../queries/search-partner-categories.query';

/**
 * URI versioning is global (`main.ts` enableVersioning), so `@Version('2')` on
 * the method plus `@Controller('partner/catalog')` resolves to
 * `POST /v2/partner/catalog/categories/tree`. Do not put "v2" in the path.
 *
 * No `@Public()`, ever: the global AuthGuard already accepts `X-Api-Key`
 * alongside a JWT, so a partner reaches this with a key and still passes
 * through PermissionGuard exactly like a signed-in user.
 */
@ApiTags('Partner catalog')
@ApiSecurity('api-key')
@Controller('partner/catalog')
@UseGuards(PermissionGuard)
export class PartnerCategoryV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('categories/tree')
  @Version('2')
  // POST because filters will arrive in the body, but this is a read: Nest's
  // default 201 would tell a partner something was created. The internal v2
  // search endpoints do return 201; this is an external contract, so it says
  // what it means.
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PARTNER_CATALOG_PERMISSION)
  @ApiOperation({
    summary: 'Active product category tree with per-branch-independent product counts',
  })
  @ApiOkResponse({ type: PartnerCategoryTreeResponseDto })
  tree(
    @Body() dto: PartnerCategoryTreeRequestDto,
    @Actor() actor: ActorContext,
  ): Promise<PartnerCategoryTreeResponseDto> {
    return this.queryBus.execute(new SearchPartnerCategoriesQuery(dto, actor));
  }
}
