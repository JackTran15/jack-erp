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
import { SupplierDepositPaymentSagaService } from './supplier-deposit-payment-saga.service';
import { CreateSupplierDepositPaymentDto } from './dto/create-supplier-deposit-payment.dto';

@Controller('supplier-deposit-payment')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class SupplierDepositPaymentController {
  constructor(private readonly saga: SupplierDepositPaymentSagaService) {}

  /**
   * Create + post one or two supplier-payment vouchers (deposit and/or cash,
   * BR-BUY-03) that settle the selected supplier debts, atomically. Idempotent
   * per X-Idempotency-Key (the frontend always sends one).
   */
  @Post()
  @RequirePermission('accounting.bank_payment.create')
  pay(
    @Body() dto: CreateSupplierDepositPaymentDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.saga.pay(dto, idempotencyKey || randomUUID(), actor);
  }

  @Get('sagas/:id')
  @RequirePermission('accounting.bank_payment.read')
  getSaga(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.saga.getSaga(id, actor);
  }
}
