import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { ApiOkResponse } from '@nestjs/swagger';
import { InvoiceService } from '../services/invoice.service';
import { CheckoutInvoiceService } from '../services/checkout-invoice.service';
import { CancelInvoiceService } from '../services/cancel-invoice.service';
import { InvoiceDebtService } from '../services/invoice-debt.service';
import { ReturnEligibilityService } from '../services/return-eligibility.service';
import { CreateReturnInvoiceService } from '../services/create-return-invoice.service';
import { CreateExchangeInvoiceService } from '../services/create-exchange-invoice.service';
import { CheckoutReturnService } from '../services/checkout-return.service';
import { PointsRedemptionService } from '../services/points-redemption.service';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { CheckoutInvoiceDto } from '../dto/checkout-invoice.dto';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';
import { DraftInvoiceResponseDto } from '../dto/draft-invoice.response.dto';
import { CustomerDebtLedgerRowDto } from '../dto/customer-debt-ledger-row.dto';
import { CreateReturnInvoiceDto } from '../dto/create-return-invoice.dto';
import { CreateExchangeInvoiceDto } from '../dto/create-exchange-invoice.dto';
import { CheckoutReturnDto } from '../dto/checkout-return.dto';
import { RedeemPointsDto } from '../dto/redeem-points.dto';
import { DebtStatus } from '../entities/invoice-debt.entity';
import { DebtPaymentMethod } from '../entities/debt-payment.entity';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';

class CollectDebtPaymentDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(DebtPaymentMethod)
  paymentMethod: DebtPaymentMethod;

  @IsUUID()
  staffId: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** Cash account that receives the payment — required when paymentMethod=cash. */
  @ValidateIf((o) => o.paymentMethod === DebtPaymentMethod.CASH)
  @IsUUID()
  cashAccountId?: string;
}

@Controller('invoices')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly checkoutService: CheckoutInvoiceService,
    private readonly cancelService: CancelInvoiceService,
    private readonly debtService: InvoiceDebtService,
    private readonly eligibilityService: ReturnEligibilityService,
    private readonly createReturnInvoiceService: CreateReturnInvoiceService,
    private readonly createExchangeInvoiceService: CreateExchangeInvoiceService,
    private readonly checkoutReturnService: CheckoutReturnService,
    private readonly pointsRedemptionService: PointsRedemptionService,
  ) {}

  @Post()
  @RequirePermission('pos.invoice.write')
  create(
    @Body() dto: CreateInvoiceDto,
    @Actor() actor: ActorContext,
  ) {
    return this.invoiceService.create(dto, actor);
  }

  @Get()
  @RequirePermission('pos.invoice.read')
  findAll(
    @Query() query: InvoiceQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.invoiceService.findAll(query, actor);
  }

  @Get('drafts')
  @RequirePermission('pos.invoice.read')
  @ApiOkResponse({ type: [DraftInvoiceResponseDto] })
  findDrafts(
    @Query('session_id') sessionId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.invoiceService.findDrafts(sessionId, actor);
  }

  @Get('customers/:customerId/debts')
  @RequirePermission('pos.invoice.read')
  @ApiOkResponse({ type: [CustomerDebtLedgerRowDto] })
  getCustomerDebts(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('status') status: DebtStatus | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.debtService.findCustomerDebts(customerId, status, actor);
  }

  @Get('debts/:debtId/payments')
  @RequirePermission('pos.invoice.read')
  getDebtPayments(
    @Param('debtId', ParseUUIDPipe) debtId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.debtService.getPaymentHistory(debtId, actor);
  }

  @Post('debts/:debtId/payments')
  @RequirePermission('pos.invoice.write')
  collectDebt(
    @Param('debtId', ParseUUIDPipe) debtId: string,
    @Body() dto: CollectDebtPaymentDto,
    @Actor() actor: ActorContext,
  ) {
    return this.debtService.collectPayment(debtId, dto, actor);
  }

  @Get(':id')
  @RequirePermission('pos.invoice.read')
  @ApiOkResponse({ type: DraftInvoiceResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.invoiceService.findOneWithItems(id, actor);
  }

  @Patch(':id')
  @RequirePermission('pos.invoice.write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
    @Actor() actor: ActorContext,
  ) {
    return this.invoiceService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('pos.invoice.write')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.invoiceService.remove(id, actor);
  }

  @Post(':id/checkout')
  @RequirePermission('pos.invoice.write')
  checkout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckoutInvoiceDto,
    @Actor() actor: ActorContext,
  ) {
    return this.checkoutService.checkout(id, dto, actor);
  }

  @Post(':id/redeem-points')
  @RequirePermission('pos.invoice.write')
  redeemPoints(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedeemPointsDto,
    @Actor() actor: ActorContext,
  ) {
    return this.pointsRedemptionService.applyRedemption(id, dto.points, actor);
  }

  @Delete(':id/redeem-points')
  @RequirePermission('pos.invoice.write')
  removeRedeemPoints(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.pointsRedemptionService.removeRedemption(id, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('pos.invoice.write')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelInvoiceDto,
    @Actor() actor: ActorContext,
  ) {
    return this.cancelService.cancel(id, dto, actor);
  }

  @Post(':id/debt')
  @RequirePermission('pos.invoice.write')
  markAsDebt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckoutInvoiceDto,
    @Actor() actor: ActorContext,
  ) {
    return this.checkoutService.checkout(id, dto, actor);
  }

  // ─── Return / Exchange (EPIC-011) ──────────────────────────────────────

  @Get(':id/eligible-returns')
  @RequirePermission('pos.return.create')
  getEligibleReturns(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.eligibilityService.getEligibleLines(id, actor);
  }

  @Post('returns')
  @RequirePermission('pos.return.create')
  createReturn(
    @Body() dto: CreateReturnInvoiceDto,
    @Actor() actor: ActorContext,
  ) {
    return this.createReturnInvoiceService.create(dto, actor);
  }

  @Post('exchanges')
  @RequirePermission('pos.exchange.create')
  createExchange(
    @Body() dto: CreateExchangeInvoiceDto,
    @Actor() actor: ActorContext,
  ) {
    return this.createExchangeInvoiceService.create(dto, actor);
  }

  @Post(':id/checkout-return')
  @RequirePermission('pos.return.create')
  checkoutReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckoutReturnDto,
    @Actor() actor: ActorContext,
  ) {
    return this.checkoutReturnService.checkout(id, dto, actor);
  }
}
