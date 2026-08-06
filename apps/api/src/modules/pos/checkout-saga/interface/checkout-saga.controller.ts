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
import { CheckoutSagaOrchestrator } from '../application/checkout-saga.orchestrator';
import { CheckoutContext, CheckoutStep, CheckoutTrace } from '../application/checkout-step';
import { LoadDraftStep } from '../application/steps/load-draft.step';
import { EvaluatePromotionStep } from '../application/steps/evaluate-promotion.step';
import { ResolveAccountsStep } from '../application/steps/resolve-accounts.step';
import { ResolveFundsStep } from '../application/steps/resolve-funds.step';
import { ComputeTotalsStep } from '../application/steps/compute-totals.step';
import { OpenSagaStep } from '../application/steps/open-saga.step';
import { LockInvoiceStep } from '../application/steps/lock-invoice.step';
import { NextDocumentNumberStep } from '../application/steps/next-document-number.step';
import { RedeemVoucherStep } from '../application/steps/redeem-voucher.step';
import { PersistInvoiceStep } from '../application/steps/persist-invoice.step';
import { PersistPaymentsStep } from '../application/steps/persist-payments.step';
import { CreateDebtStep } from '../application/steps/create-debt.step';
import { RedeemPointsStep } from '../application/steps/redeem-points.step';
import { DeductStockStep } from '../application/steps/deduct-stock.step';
import { PostJournalStep } from '../application/steps/post-journal.step';
import { PostCashStep } from '../application/steps/post-cash.step';
import { PostDepositStep } from '../application/steps/post-deposit.step';
import { EnqueueOutboxStep } from '../application/steps/enqueue-outbox.step';
import { CloseSagaStep } from '../application/steps/close-saga.step';
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
 */
@ApiTags('pos-checkout-v2')
@Controller('pos/checkout')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CheckoutSagaController {
  constructor(
    private readonly orchestrator: CheckoutSagaOrchestrator,
    private readonly loadDraft: LoadDraftStep,
    private readonly evaluatePromotion: EvaluatePromotionStep,
    private readonly resolveAccounts: ResolveAccountsStep,
    private readonly resolveFunds: ResolveFundsStep,
    private readonly computeTotals: ComputeTotalsStep,
    private readonly openSaga: OpenSagaStep,
    private readonly lockInvoice: LockInvoiceStep,
    private readonly nextDocumentNumber: NextDocumentNumberStep,
    private readonly redeemVoucher: RedeemVoucherStep,
    private readonly persistInvoice: PersistInvoiceStep,
    private readonly persistPayments: PersistPaymentsStep,
    private readonly createDebt: CreateDebtStep,
    private readonly redeemPoints: RedeemPointsStep,
    private readonly deductStock: DeductStockStep,
    private readonly postJournal: PostJournalStep,
    private readonly postCash: PostCashStep,
    private readonly postDeposit: PostDepositStep,
    private readonly enqueueOutbox: EnqueueOutboxStep,
    private readonly closeSaga: CloseSagaStep,
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

    const ctx: CheckoutContext = {
      actor,
      input: dto,
      correlationId,
      idempotencyKey,
      dryRun: dto.dryRun === true,
    };
    const trace = new CheckoutTrace();
    const steps = this.allSteps();

    await this.orchestrator.run(steps, ctx, trace, steps.length);

    return {
      committed: !ctx.dryRun,
      invoiceId: ctx.invoice?.id,
      sagaId: ctx.sagaId,
      documentNumber: ctx.documentNumber,
      totals: ctx.totals,
      appliedPrograms: ctx.promotion?.appliedPrograms ?? [],
      steps: trace.entries.map((entry) => ({
        seq: entry.seq,
        name: entry.name,
        phase: entry.phase,
        status: entry.status,
        durationMs: entry.durationMs,
      })),
    };
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

  /**
   * Registration order === execution order (the orchestrator does not
   * reorder). All 19 steps are now wired — never renumber a step already
   * here so the trail stays comparable across slices.
   */
  private allSteps(): CheckoutStep[] {
    return [
      this.loadDraft,
      this.evaluatePromotion,
      this.resolveAccounts,
      this.resolveFunds,
      this.computeTotals,
      this.openSaga,
      this.lockInvoice,
      this.nextDocumentNumber,
      this.redeemVoucher,
      this.persistInvoice,
      this.persistPayments,
      this.createDebt,
      this.redeemPoints,
      this.deductStock,
      this.postJournal,
      this.postCash,
      this.postDeposit,
      this.enqueueOutbox,
      this.closeSaga,
    ];
  }
}
