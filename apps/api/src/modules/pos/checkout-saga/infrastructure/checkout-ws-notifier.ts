import { Injectable } from '@nestjs/common';
import { WebSocketEmitterService } from '../../../websocket/websocket-emitter.service';
import { CheckoutContext, CheckoutWsEmitter } from '../application/checkout-step';

/**
 * Thin adapter over `WebSocketEmitterService` — see `CheckoutWsEmitter` in
 * checkout-step.ts for why this is a port rather than a direct dependency.
 * No try/catch here; the orchestrator's caller owns that (best-effort,
 * consistent with how it also treats `CheckoutFailureRecorder`).
 */
@Injectable()
export class CheckoutWsNotifier implements CheckoutWsEmitter {
  constructor(private readonly wsEmitter: WebSocketEmitterService) {}

  emit(ctx: CheckoutContext): void {
    if (!ctx.wsNotification || !ctx.actor.branchId) return;
    this.wsEmitter.emitToBranch(ctx.actor.branchId, ctx.wsNotification);
  }
}
