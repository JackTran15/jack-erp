import { Injectable } from '@nestjs/common';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { VoucherService } from '../../../../promotion/voucher.service';

/**
 * Marks the voucher used, inline, in the checkout transaction. Parity target:
 * fixes bug (h) in 00-intent.md — on v1, `PromotionApplyService.apply`
 * (validates + reserves) and `commitPromotions` (marks used) are two separate
 * transactions minutes apart, so two drafts that both applied the same
 * voucher can both reach checkout and both redeem it.
 *
 * This is the ONLY thing that actually prevents that: `resolve-funds`
 * (preflight, T-05-01) validates the voucher too, but that is a cheap early
 * error for the common case, not a race guard — two concurrent checkouts can
 * both pass it before either commits. `VoucherService.markUsed` is a
 * conditional `UPDATE ... WHERE is_used = false AND is_active = true`; the
 * loser gets `affected = 0` and a `ConflictException`, which propagates out
 * of this step unchanged and rolls back the whole checkout (`409
 * VOUCHER_ALREADY_USED`). Do not remove this step on the theory that
 * `resolve-funds` already validated — that check has no defense against a
 * second draft racing in between.
 *
 * Order: step 09, right after `next-document-number` (08) and before
 * `persist-invoice` (10) — the position reserved for it since T-02-07,
 * matching the lock order documented in `checkout-step.ts`.
 */
@Injectable()
export class RedeemVoucherStep implements CheckoutStep {
  readonly name = 'redeem-voucher';
  readonly phase = 'transactional' as const;

  constructor(private readonly voucherService: VoucherService) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;
    if (!ctx.voucherId) return; // no voucher on this checkout

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    if (!invoice) {
      throw new Error(
        'redeem-voucher ran before its prerequisite steps populated the context',
      );
    }

    await this.voucherService.markUsed(ctx.voucherId, invoice.id, manager);
  }
}
