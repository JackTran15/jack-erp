import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  SearchBranchSalesOrdersDto,
  SearchBranchSalesOrdersResult,
} from '../dto/search-branch-sales-orders.dto';
import { SearchBranchSalesOrdersQuery } from '../queries/search-branch-sales-orders.query';
import { SALES_ORDER_PERMISSIONS } from '../sales-order.service';

/**
 * POS order grids (ADR-03) — `POST /v2/mobile/sales-orders/search`.
 *
 * Guards match `SalesOrderController`: the branch is the validated
 * `X-Branch-Id`, never a body field.
 */
@ApiTags('mobile')
@Controller('mobile/sales-orders')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class BranchSalesOrderV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(SALES_ORDER_PERMISSIONS.read)
  search(
    @Body() dto: SearchBranchSalesOrdersDto,
    @Actor() actor: ActorContext,
  ): Promise<SearchBranchSalesOrdersResult> {
    return this.queryBus.execute(new SearchBranchSalesOrdersQuery(dto, actor));
  }
}
