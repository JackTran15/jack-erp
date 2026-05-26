import { randomUUID } from 'crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { SupplierDebtPaymentSagaService } from './supplier-debt-payment-saga.service';
import { CreateSupplierDebtPaymentDto } from './dto/create-supplier-debt-payment.dto';

@Controller('cash-payments/supplier-debt-payment')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class SupplierDebtPaymentController {
  constructor(private readonly saga: SupplierDebtPaymentSagaService) {}

  /**
   * Create + post a supplier-payment Phiếu Chi that settles the selected
   * supplier debts and debits the cash fund, atomically. Idempotent per
   * X-Idempotency-Key (the frontend always sends one).
   */
  @Post()
  @RequirePermission('accounting.cash_payment.create')
  pay(
    @Body() dto: CreateSupplierDebtPaymentDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.saga.pay(dto, idempotencyKey || randomUUID(), actor);
  }

  @Get('sagas/:id')
  @RequirePermission('accounting.cash_payment.read')
  getSaga(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.saga.getSaga(id, actor);
  }
}
