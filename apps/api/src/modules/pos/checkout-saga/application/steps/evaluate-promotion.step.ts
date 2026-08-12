import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { EvaluateCartResponse } from '@erp/shared-interfaces';
import { CheckoutContext, CheckoutStep } from '../checkout-step';
import { EvaluateCartQuery } from '../../../../promotion/application/queries/evaluate-cart.query';
import {
  EvaluateCartDto,
  EvaluateCartLineInputDto,
} from '../../../../promotion/application/dto/evaluate-cart.dto';

/**
 * Real promotion evaluation (ADR-06): dispatches `EvaluateCartQuery` on the
 * `QueryBus` — already registered app-wide by `PromotionModule` (which this
 * module already imports) — rather than importing `PromotionResolver`
 * directly. `PromotionResolver` is not exported by `promotion.module.ts`, and
 * adding that export would be touching existing code; going through the same
 * bus the standalone `/promotion/evaluate` endpoint uses needs no such
 * export.
 *
 * A-04: the server recomputes the discount from scratch — every line here
 * comes from `ctx.items` (server-loaded), never from anything in the client's
 * request body. If a client sends its own `discountAmount` in the checkout
 * payload, `CheckoutInput`/`CheckoutV2Dto` don't even declare that field, so
 * `forbidNonWhitelisted` rejects it before this step ever runs.
 *
 * Preflight, outside the transaction (A-11): if the set of active programs
 * changes between this read and COMMIT, the sale uses whatever was true at
 * preflight time — accepted, same read-outside-transaction posture
 * `EvaluateCartQuery` itself already has for the live `/promotion/evaluate`
 * endpoint. `compute-totals` still defaults `promotionDiscount` to 0 whenever
 * this step is skipped/replayed, so nothing downstream is coupled to this
 * running.
 *
 * Only imports from `promotion/application` (the query + its DTOs) — nothing
 * from `promotion/domain`.
 */
@Injectable()
export class EvaluatePromotionStep implements CheckoutStep {
  readonly name = 'evaluate-promotion';
  readonly phase = 'preflight' as const;

  constructor(private readonly queryBus: QueryBus) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    const invoice = ctx.invoice;
    const items = ctx.items;
    if (!invoice || !items) {
      throw new Error(
        'evaluate-promotion ran before load-draft populated the context',
      );
    }

    const dto = new EvaluateCartDto();
    dto.customerId = invoice.customerId ?? undefined;
    dto.selectedProgramIds = ctx.input.selectedProgramIds;
    dto.excludedProgramIds = ctx.input.excludedProgramIds;
    dto.lines = items.map((item) => {
      const line = new EvaluateCartLineInputDto();
      // invoice_items.id, not any client-sent lineId — maps engine results
      // back to the exact draft line regardless of what the client sent.
      line.lineId = item.id;
      line.itemId = item.itemId;
      line.quantity = Number(item.quantity);
      line.unitPrice = Number(item.unitPrice);
      line.manualLineDiscount = Number(item.lineDiscount) || undefined;
      return line;
    });

    const evaluation: EvaluateCartResponse = await this.queryBus.execute(
      new EvaluateCartQuery(dto, ctx.actor),
    );

    ctx.promotion = {
      promotionDiscount: evaluation.promotionDiscount,
      appliedPrograms: evaluation.appliedPrograms,
      lineDiscounts: evaluation.appliedPrograms.flatMap((program) => program.lineDiscounts),
    };
  }
}
