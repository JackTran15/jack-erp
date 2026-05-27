import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import { BranchScopeGuard } from '../rbac/branch-scope.guard';
import { AuditInterceptor } from '../crud/audit.interceptor';
import {
  PosSessionService,
  PosCatalogService,
  PosCatalogProductService,
} from './services';
import {
  OpenSessionDto,
  SubmitReconciliationDto,
  PosCatalogQueryDto,
  PosCatalogProductsQueryDto,
  PosCatalogProductDetailQueryDto,
  PosProductListResponseDto,
  PosProductDetailDto,
} from './dto';

@Controller('pos')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class PosController {
  constructor(
    private readonly sessionService: PosSessionService,
    private readonly catalogService: PosCatalogService,
    private readonly catalogProductService: PosCatalogProductService,
  ) {}

  @Get('branches/:branchId/catalog')
  @RequirePermission('pos.sale.create')
  getCatalog(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: PosCatalogQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.catalogService.getCatalog(
      branchId,
      actor,
      query.search,
      query.direction,
    );
  }

  @Get('branches/:branchId/catalog/products')
  @RequirePermission('pos.sale.create')
  @ApiOkResponse({ type: PosProductListResponseDto })
  listCatalogProducts(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: PosCatalogProductsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.catalogProductService.listProducts(branchId, actor, query);
  }

  @Get('branches/:branchId/catalog/products/:id')
  @RequirePermission('pos.sale.create')
  @ApiOkResponse({ type: PosProductDetailDto })
  getCatalogProductDetail(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PosCatalogProductDetailQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.catalogProductService.getProductDetail(
      branchId,
      id,
      query.kind,
      actor,
    );
  }

  @Post('sessions/open')
  @RequirePermission('pos.session.manage')
  openSession(
    @Body() dto: OpenSessionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.sessionService.openSession(dto, actor);
  }

  @Post('sessions/:id/start-sales')
  @RequirePermission('pos.session.manage')
  startSales(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.sessionService.startSales(id, actor);
  }

  @Get('sessions/:id')
  @RequirePermission('pos.session.manage')
  getSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.sessionService.findOrFail(id, actor);
  }

  @Post('sessions/:id/start-close')
  @RequirePermission('pos.session.manage')
  startClose(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.sessionService.startClose(id, actor);
  }

  @Get('sessions/:id/reconciliation')
  @RequirePermission('pos.session.manage')
  getReconciliation(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.sessionService.getReconciliation(id, actor);
  }

  @Post('sessions/:id/reconciliation')
  @RequirePermission('pos.session.manage')
  submitReconciliation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReconciliationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.sessionService.submitReconciliation(id, dto, actor);
  }

  @Post('sessions/:id/reconciliation/approve')
  @RequirePermission('pos.session.approve_variance')
  approveVariance(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.sessionService.approveVariance(id, actor);
  }

  @Post('sessions/:id/close')
  @RequirePermission('pos.session.manage')
  finalizeClose(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.sessionService.finalizeClose(id, actor);
  }
}
