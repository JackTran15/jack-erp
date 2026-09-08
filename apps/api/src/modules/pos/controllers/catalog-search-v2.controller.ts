import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse } from '@nestjs/swagger';

import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PermissionGuard } from '../../rbac/permission.guard';
import { PosCatalogSearchQueryDto } from '../dto/pos-catalog-search.query.dto';
import {
  PosCatalogLineResponseDto,
  PosCatalogSearchResponseDto,
} from '../dto/pos-catalog-search.response.dto';
import { PosCatalogStockQueryDto } from '../dto/pos-catalog-stock.dto';
import { PosCatalogService } from '../services/pos-catalog.service';
import { SearchPosCatalogQuery } from '../queries/search-pos-catalog.query';

/**
 * The POS search bar in one round trip. `GET /pos/branches/:id/catalog` and
 * `/catalog/lookup` stay exactly as they are on PosController — fast stock
 * transfer still uses them, and this endpoint is additive.
 */
@Controller('pos')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CatalogSearchV2Controller {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly catalog: PosCatalogService,
  ) {}

  // Reading the branch catalogue is not selling: gate on the read permission,
  // the same as the two endpoints this one merges.
  @Get('branches/:branchId/catalog/search')
  @RequirePermission('inventory.read')
  @ApiOkResponse({ type: PosCatalogSearchResponseDto })
  search(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: PosCatalogSearchQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<PosCatalogSearchResponseDto> {
    return this.queryBus.execute(
      new SearchPosCatalogQuery(branchId, query, actor),
    );
  }

  /**
   * Branch stock for a known set of items — what the POS page needs to refresh
   * the on-hand snapshot of the lines already in the cart.
   *
   * POST rather than GET because the payload is a list whose length follows the
   * cart, and a dozen UUIDs already crowd a query string. It reads rather than
   * writes; the global idempotency interceptor only engages on an explicit
   * X-Idempotency-Key, and replaying the same body would return the same rows
   * anyway.
   *
   * Not routed through the QueryBus: this is a primary-key fetch, not a query
   * with dynamic multi-join filters.
   */
  @Post('branches/:branchId/catalog/stock')
  @RequirePermission('inventory.read')
  @ApiOkResponse({ type: [PosCatalogLineResponseDto] })
  stock(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: PosCatalogStockQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<PosCatalogLineResponseDto[]> {
    return this.catalog.getStockForItems(
      branchId,
      actor,
      body.itemIds,
    ) as Promise<PosCatalogLineResponseDto[]>;
  }
}
