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
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import { BranchScopeGuard } from '../rbac/branch-scope.guard';
import { AuditInterceptor } from '../crud/audit.interceptor';
import {
  PosSessionService,
  CheckoutService,
  ReturnService,
  ExchangeService,
  PosCatalogService,
} from './services';
import {
  OpenSessionDto,
  CheckoutDto,
  ProcessReturnDto,
  ProcessExchangeDto,
  SubmitReconciliationDto,
  PosCatalogQueryDto,
} from './dto';

@Controller('pos')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class PosController {
  constructor(
    private readonly sessionService: PosSessionService,
    private readonly checkoutService: CheckoutService,
    private readonly returnService: ReturnService,
    private readonly exchangeService: ExchangeService,
    private readonly catalogService: PosCatalogService,
  ) {}

  @Get('branches/:branchId/catalog')
  @RequirePermission('pos.sale.create')
  getCatalog(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: PosCatalogQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.catalogService.getCatalog(branchId, actor, query.search);
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

  @Post('sales/checkout')
  @RequirePermission('pos.sale.create')
  checkout(
    @Body() dto: CheckoutDto,
    @Actor() actor: ActorContext,
  ) {
    return this.checkoutService.checkout(dto, actor);
  }

  @Get('sales/:id')
  @RequirePermission('pos.sale.create')
  getSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.checkoutService.findSaleOrFail(id, actor);
  }

  @Post('sales/:id/return')
  @RequirePermission('pos.return.create')
  processReturn(
    @Param('id', ParseUUIDPipe) saleId: string,
    @Body() dto: ProcessReturnDto,
    @Actor() actor: ActorContext,
  ) {
    return this.returnService.processReturn(saleId, dto, actor);
  }

  @Post('sales/:id/exchange')
  @RequirePermission('pos.exchange.create')
  processExchange(
    @Param('id', ParseUUIDPipe) saleId: string,
    @Body() dto: ProcessExchangeDto,
    @Actor() actor: ActorContext,
  ) {
    return this.exchangeService.processExchange(saleId, dto, actor);
  }
}
