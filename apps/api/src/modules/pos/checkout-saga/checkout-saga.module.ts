import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../../accounting/accounting.module';
import { StockLedgerModule } from '../../inventory/ledger/stock-ledger.module';
import { ItemCostSnapshotModule } from '../../inventory/location/item-cost-snapshot.module';
import { CustomerModule } from '../../customer/customer.module';
import { PromotionModule } from '../../promotion/promotion.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { WebSocketModule } from '../../websocket/websocket.module';
import { PosModule } from '../pos.module';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { CheckoutSagaEntity } from './infrastructure/checkout-saga.entity';
import { CheckoutSagaStepEntity } from './infrastructure/checkout-saga-step.entity';
import { InvoiceCheckoutPromotionEntity } from './infrastructure/invoice-checkout-promotion.entity';
import { CheckoutTraceLogger } from './infrastructure/checkout-trace.logger';
import { CheckoutSagaFailureRecorder } from './infrastructure/checkout-saga-failure-recorder';
import { CheckoutWsNotifier } from './infrastructure/checkout-ws-notifier';
import {
  CHECKOUT_FAILURE_RECORDER,
  CHECKOUT_STEP_LOGGER,
  CHECKOUT_WS_EMITTER,
} from './application/checkout-step';
import { CheckoutSagaOrchestrator } from './application/checkout-saga.orchestrator';
import { LoadDraftStep } from './application/steps/load-draft.step';
import { EvaluatePromotionStep } from './application/steps/evaluate-promotion.step';
import { ResolveAccountsStep } from './application/steps/resolve-accounts.step';
import { ResolveFundsStep } from './application/steps/resolve-funds.step';
import { ComputeTotalsStep } from './application/steps/compute-totals.step';
import { OpenSagaStep } from './application/steps/open-saga.step';
import { LockInvoiceStep } from './application/steps/lock-invoice.step';
import { NextDocumentNumberStep } from './application/steps/next-document-number.step';
import { RedeemVoucherStep } from './application/steps/redeem-voucher.step';
import { PersistInvoiceStep } from './application/steps/persist-invoice.step';
import { PersistPaymentsStep } from './application/steps/persist-payments.step';
import { CreateDebtStep } from './application/steps/create-debt.step';
import { RedeemPointsStep } from './application/steps/redeem-points.step';
import { DeductStockStep } from './application/steps/deduct-stock.step';
import { PostJournalStep } from './application/steps/post-journal.step';
import { PostCashStep } from './application/steps/post-cash.step';
import { PostDepositStep } from './application/steps/post-deposit.step';
import { EnqueueOutboxStep } from './application/steps/enqueue-outbox.step';
import { CloseSagaStep } from './application/steps/close-saga.step';
import { CheckoutSagaController } from './interface/checkout-saga.controller';

/**
 * Wires the v2 checkout saga into the app. A leaf module — nothing here is
 * exported, since nothing outside this feature needs to reach into it.
 *
 * `StockLedgerModule` is not used by any provider yet (that lands in UOW-03)
 * but is imported now so that `pos.module.ts` — the one existing file this
 * epic is allowed to touch — is only ever touched this once.
 *
 * `PosModule` is imported for `InvoiceDebtService` (used by `CreateDebtStep`).
 * `PosModule` in turn imports this module (to register `CheckoutSagaModule`
 * itself), so this is a genuine circular module reference — `forwardRef` on
 * both sides is the standard NestJS resolution for it, and the same pattern
 * this repo already uses for `GoodsIssueModule` ↔ `TransferOrderModule`. It is
 * a module-level cycle only (`InvoiceDebtService` does not depend on anything
 * here), so no provider-level `@Inject(forwardRef(...))` is needed.
 *
 * `WebSocketModule` is imported for `CHECKOUT_WS_EMITTER` (T-03-05) — the
 * orchestrator's constructor already depends on it, so unlike the other new
 * UOW-03 step classes (registered all at once by T-03-06, matching how
 * T-02-07 registered UOW-02's), this one dependency can't wait: the
 * orchestrator is already wired and instantiated by Nest today.
 *
 * `ItemCostSnapshotModule` is new in T-03-06, for `DeductStockStep`'s
 * `ItemCostSnapshotService` dependency.
 *
 * `InvoiceCheckoutPromotionEntity` is added to `forFeature` (T-04-07) even
 * though no provider ever injects its repository — every access goes through
 * `manager.getRepository(InvoiceCheckoutPromotionEntity)` inside the saga's
 * own transaction (`persist-invoice.step.ts`). `forFeature()` is still what
 * registers an entity's metadata with the app's shared TypeORM connection;
 * skipping it (T-04-02's original call) meant that connection never learned
 * about the entity at all, and `manager.getRepository()` threw "No metadata
 * found" on every real checkout with an applied promotion — see A-31.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CheckoutSagaEntity,
      CheckoutSagaStepEntity,
      InvoiceEntity,
      InvoiceItemEntity,
      InvoicePaymentEntity,
      InvoiceCheckoutPromotionEntity,
    ]),
    CqrsModule,
    AccountingModule,
    StockLedgerModule,
    ItemCostSnapshotModule,
    CustomerModule,
    PromotionModule,
    DocumentNumberingModule,
    WebSocketModule,
    forwardRef(() => PosModule),
  ],
  controllers: [CheckoutSagaController],
  providers: [
    { provide: CHECKOUT_STEP_LOGGER, useClass: CheckoutTraceLogger },
    { provide: CHECKOUT_FAILURE_RECORDER, useClass: CheckoutSagaFailureRecorder },
    { provide: CHECKOUT_WS_EMITTER, useClass: CheckoutWsNotifier },
    CheckoutSagaOrchestrator,
    LoadDraftStep,
    EvaluatePromotionStep,
    ResolveAccountsStep,
    ResolveFundsStep,
    ComputeTotalsStep,
    OpenSagaStep,
    LockInvoiceStep,
    NextDocumentNumberStep,
    RedeemVoucherStep,
    PersistInvoiceStep,
    PersistPaymentsStep,
    CreateDebtStep,
    RedeemPointsStep,
    DeductStockStep,
    PostJournalStep,
    PostCashStep,
    PostDepositStep,
    EnqueueOutboxStep,
    CloseSagaStep,
  ],
})
export class CheckoutSagaModule {}
