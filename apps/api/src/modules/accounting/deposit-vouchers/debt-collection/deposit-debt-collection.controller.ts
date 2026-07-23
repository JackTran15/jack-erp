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
import { DepositDebtCollectionSagaService } from './deposit-debt-collection-saga.service';
import { CreateDepositDebtCollectionReceiptDto } from './dto/create-deposit-debt-collection-receipt.dto';

@Controller('bank-receipts/debt-collection')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositDebtCollectionController {
  constructor(private readonly saga: DepositDebtCollectionSagaService) {}

  /**
   * Create + post a debt-collection Phiếu thu tiền gửi that settles the selected
   * invoice debts and credits the deposit fund, atomically. Idempotent per
   * X-Idempotency-Key (the frontend always sends one).
   */
  @Post()
  @RequirePermission('accounting.bank_receipt.create')
  collect(
    @Body() dto: CreateDepositDebtCollectionReceiptDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.saga.collect(dto, idempotencyKey || randomUUID(), actor);
  }

  @Get('sagas/:id')
  @RequirePermission('accounting.bank_receipt.read')
  getSaga(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.saga.getSaga(id, actor);
  }
}
