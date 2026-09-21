import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { CheckoutSagaRunner } from '../application/checkout-saga.runner';
import { CheckoutSagaEntity } from '../infrastructure/checkout-saga.entity';
import { CheckoutSagaStepEntity } from '../infrastructure/checkout-saga-step.entity';
import { CheckoutV2Dto } from './dto/checkout-v2.dto';

/**
 * HTTP surface for the checkout saga. Guards mirror `invoice.controller.ts`
 * exactly — otherwise a v1/v2 parity comparison would be comparing two
 * differently-protected endpoints.
 *
 * Step 09 (`redeem-voucher`, UOW-05) is the only one not registered yet —
 * `orchestrator.run` only ever sees the steps actually wired at each slice,
 * so its absence here is not a gap to fill, it is this slice's honest scope.
 * Steps 14-18 (inline stock/GL/cash/deposit, outbox) landed in T-03-06.
 *
 * The step list and the run itself live in `CheckoutSagaRunner` (T-03-01) so
 * the mobile cashier path runs the exact same saga; this controller only owns
 * the HTTP contract — route, permission, and how headers become the
 * idempotency key and correlation id.
 */
@ApiTags('pos-checkout-v2')
@Controller('pos/checkout')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CheckoutSagaController {
  constructor(
    private readonly runner: CheckoutSagaRunner,
    @InjectRepository(CheckoutSagaEntity)
    private readonly sagaRepo: Repository<CheckoutSagaEntity>,
    @InjectRepository(CheckoutSagaStepEntity)
    private readonly sagaStepRepo: Repository<CheckoutSagaStepEntity>,
  ) {}

  @Post()
  @Version('2')
  @RequirePermission('pos.invoice.write')
  async checkout(
    @Body() dto: CheckoutV2Dto,
    @Headers('x-idempotency-key') idempotencyKeyHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    // Defaults to invoiceId when the client sends no header — the DB-level
    // idempotency (ADR-05) is keyed on this, same as the header contract
    // documented since T-01-07.
    const idempotencyKey = idempotencyKeyHeader || dto.invoiceId;
    const correlationId = requestId ?? idempotencyKey;

    return this.runner.run(
      dto,
      { idempotencyKey, correlationId, dryRun: dto.dryRun === true },
      actor,
    );
  }

  @Get('sagas/:id')
  @Version('2')
  @RequirePermission('pos.invoice.read')
  async getSaga(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    const saga = await this.sagaRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!saga) {
      throw new NotFoundException({
        code: 'CHECKOUT_SAGA_NOT_FOUND',
        message: `Checkout saga ${id} not found`,
      });
    }

    const steps = await this.sagaStepRepo.find({
      where: { sagaId: saga.id },
      order: { seq: 'ASC' },
    });

    return { saga, steps };
  }
}
