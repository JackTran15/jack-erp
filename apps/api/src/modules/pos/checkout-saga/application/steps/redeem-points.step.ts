import { Injectable } from '@nestjs/common';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { MembershipCardService } from '../../../../customer/services/membership-card.service';

/**
 * Redeems loyalty points inside the transaction. Reuses
 * `MembershipCardService.redeemPointsForInvoice`, which locks the card,
 * re-validates the balance, and throws when it is insufficient — that throw
 * rolls back the whole checkout, so a discount is never granted without the
 * points actually being taken. Deliberately not wrapped in try/catch: that
 * would be nuking the exact safety this step exists to rely on. Parity
 * target: checkout-invoice.service.ts:296-306.
 */
@Injectable()
export class RedeemPointsStep implements CheckoutStep {
  readonly name = 'redeem-points';
  readonly phase = 'transactional' as const;

  constructor(private readonly membershipCardService: MembershipCardService) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    if (!invoice) {
      throw new Error(
        'redeem-points ran before its prerequisite steps populated the context',
      );
    }

    if (!(invoice.pointsRedeemed > 0 && invoice.customerId)) return;

    await this.membershipCardService.redeemPointsForInvoice(
      {
        customerId: invoice.customerId,
        points: invoice.pointsRedeemed,
        invoiceId: invoice.id,
      },
      manager,
      ctx.actor,
    );
  }
}
