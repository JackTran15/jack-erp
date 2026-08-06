import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountResolverService } from '../../../../accounting/payment-accounts/account-resolver.service';
import {
  AccountingDefaultAccountRole,
  PaymentAccountMethod,
} from '../../../../accounting/payment-accounts/enums';
import { InvoicePaymentMethod } from '../../../entities/invoice.entity';
import { CheckoutContext, CheckoutStep, ResolvedPaymentAccount } from '../checkout-step';

/** POS payment method → payment-account config method. Same string values,
 *  kept decoupled at the type level (mirrors checkout-invoice.service.ts). */
const PAYMENT_METHOD_TO_ACCOUNT_METHOD: Record<
  InvoicePaymentMethod,
  PaymentAccountMethod
> = {
  [InvoicePaymentMethod.CASH]: PaymentAccountMethod.CASH,
  [InvoicePaymentMethod.BANK_TRANSFER]: PaymentAccountMethod.BANK_TRANSFER,
  [InvoicePaymentMethod.CARD]: PaymentAccountMethod.CARD,
};

/**
 * Resolves every posting account server-side, before any transaction opens.
 * Parity target: checkout-invoice.service.ts:174-213.
 *
 * RECEIVABLE is a special case: whether it is *required* depends on
 * `remainder`, which `compute-totals` (a later step) computes. This step
 * always attempts to resolve RECEIVABLE and swallows "not configured" into
 * `undefined`; `compute-totals` enforces the requirement once it knows
 * whether there is actually a debt. That reproduces v1's exact behaviour — an
 * org that never sells on credit is never forced to configure a RECEIVABLE
 * account — without reordering the step list (resolve-accounts already runs
 * before compute-totals).
 *
 * `AccountResolverService` (existing, unmodified) throws plain-string
 * `BadRequestException`s — no `{ code }` body. The error taxonomy in
 * 03-logical-design.md promises `ACCOUNT_NOT_CONFIGURED` / `PAYMENT_ACCOUNT_INVALID`,
 * so failures from it are caught here and re-thrown with that shape, without
 * touching the underlying service.
 */
@Injectable()
export class ResolveAccountsStep implements CheckoutStep {
  readonly name = 'resolve-accounts';
  readonly phase = 'preflight' as const;

  constructor(private readonly accountResolver: AccountResolverService) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    const revenueAccountId = await this.resolveRevenue(ctx);
    const receivableAccountId = await this.tryResolveReceivable(ctx);

    const resolvedByKey = new Map<string, ResolvedPaymentAccount>();
    const perPayment: ResolvedPaymentAccount[] = [];
    for (const payment of ctx.input.payments) {
      const cacheKey =
        payment.paymentAccountId ?? `default:${payment.paymentMethod}`;
      let resolved = resolvedByKey.get(cacheKey);
      if (!resolved) {
        resolved = await this.resolvePaymentAccount(ctx, payment);
        resolvedByKey.set(cacheKey, resolved);
      }
      perPayment.push(resolved);
    }

    ctx.accounts = { revenueAccountId, receivableAccountId, perPayment };
  }

  private async resolveRevenue(ctx: CheckoutContext): Promise<string> {
    try {
      return await this.accountResolver.resolveDefaultAccount(
        AccountingDefaultAccountRole.REVENUE,
        ctx.actor,
      );
    } catch (err) {
      throw this.wrap(err, 'ACCOUNT_NOT_CONFIGURED');
    }
  }

  private async tryResolveReceivable(
    ctx: CheckoutContext,
  ): Promise<string | undefined> {
    try {
      return await this.accountResolver.resolveDefaultAccount(
        AccountingDefaultAccountRole.RECEIVABLE,
        ctx.actor,
      );
    } catch (err) {
      if (err instanceof BadRequestException) return undefined;
      throw err;
    }
  }

  private async resolvePaymentAccount(
    ctx: CheckoutContext,
    payment: CheckoutContext['input']['payments'][number],
  ): Promise<ResolvedPaymentAccount> {
    try {
      return await this.accountResolver.resolvePaymentAccount(
        PAYMENT_METHOD_TO_ACCOUNT_METHOD[payment.paymentMethod],
        ctx.actor,
        payment.paymentAccountId,
      );
    } catch (err) {
      throw this.wrap(err, 'PAYMENT_ACCOUNT_INVALID');
    }
  }

  /** Re-throws a plain-string BadRequestException from the underlying service as `{ code, message }`. */
  private wrap(err: unknown, code: string): unknown {
    if (err instanceof BadRequestException) {
      const response = err.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string }).message ?? err.message);
      return new BadRequestException({ code, message });
    }
    return err;
  }
}
