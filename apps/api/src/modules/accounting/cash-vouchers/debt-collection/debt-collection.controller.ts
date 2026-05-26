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
import { DebtCollectionSagaService } from './debt-collection-saga.service';
import { CreateDebtCollectionReceiptDto } from './dto/create-debt-collection-receipt.dto';

@Controller('cash-receipts/debt-collection')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DebtCollectionController {
  constructor(private readonly saga: DebtCollectionSagaService) {}

  /**
   * Create + post a debt-collection Phiếu Thu that settles the selected invoice
   * debts and credits the cash fund, atomically. Idempotent per
   * X-Idempotency-Key (the frontend always sends one).
   */
  @Post()
  @RequirePermission('accounting.cash_receipt.create')
  collect(
    @Body() dto: CreateDebtCollectionReceiptDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.saga.collect(dto, idempotencyKey || randomUUID(), actor);
  }

  @Get('sagas/:id')
  @RequirePermission('accounting.cash_receipt.read')
  getSaga(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.saga.getSaga(id, actor);
  }
}
