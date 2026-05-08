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
import { InvoiceService } from '../services/invoice.service';
import { CheckoutInvoiceService } from '../services/checkout-invoice.service';
import { CancelInvoiceService } from '../services/cancel-invoice.service';
import { InvoiceDebtService } from '../services/invoice-debt.service';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { CheckoutInvoiceDto } from '../dto/checkout-invoice.dto';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';
import { DebtStatus } from '../entities/invoice-debt.entity';
import { DebtPaymentMethod } from '../entities/debt-payment.entity';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
  findDrafts(
    @Query('session_id') sessionId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.invoiceService.findDrafts(sessionId, actor);
  }

  @Get('customers/:customerId/debts')
  @RequirePermission('pos.invoice.read')
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
}
