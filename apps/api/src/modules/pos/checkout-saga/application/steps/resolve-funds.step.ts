import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@erp/shared-interfaces';
import { CashFundResolverService } from '../../../../accounting/cash/cash-fund-resolver.service';
import { DocumentNumberingService } from '../../../../document-numbering/document-numbering.service';
import { VoucherService } from '../../../../promotion/voucher.service';
import { InvoiceEntity, InvoicePaymentMethod } from '../../../entities/invoice.entity';
import { CheckoutContext, CheckoutStep } from '../checkout-step';

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * Resolves the branch cash fund up front — this is the fix for the highest-
 * probability bug of the old flow: `resolveBranchCashFund` used to run
 * *after* commit (checkout-invoice.service.ts:390), so a misconfigured branch
 * produced a fully-posted, un-fundable sale (bug (e) in 00-intent.md). Here it
 * is a preflight check: fail before anything is written, not after.
 *
 * Also validates a document-numbering rule exists via the public `preview()`
 * — which self-provisions a default rule when none exists (A-07) — so
 * `next-document-number` (a transactional step) never discovers a missing
 * rule mid-transaction. The preview value itself is discarded; the real
 * number is minted by `next-document-number`.
 *
 * Deposit-fund routing and period-lock validation deliberately stay inline in
 * `post-deposit` (T-03-04) rather than here — that logic
 * (`DepositRoutingService` + `DepositPeriodGuardService`) is tied to the
 * consumer it is ported from, and duplicating it in preflight would create a
 * second source of truth for the same decision.
 *
 * `CashFundResolverService` (unmodified) throws a plain-string
 * `BadRequestException`, and `DocumentNumberingService.preview` throws a
 * `NotFoundException` (404) rather than the 400 the error taxonomy promises.
 * Both are caught here and re-thrown with the `{ code }` shape and status
 * 03-logical-design.md documents, without touching either service.
 *
 * T-05-01 also validates a voucher here, when the request carries one — the
 * cheapest place to fail loudly for the common case (expired, wrong customer,
 * already used). This is **not** the race guard: two drafts checking out the
 * same voucher can both pass this check before either commits.
 * `redeem-voucher.step.ts` (transactional, step 09) is what actually prevents
 * double-redemption, via `VoucherService.markUsed`'s conditional UPDATE — do
 * not remove that step on the theory that "it's already validated here".
 */
@Injectable()
export class ResolveFundsStep implements CheckoutStep {
  readonly name = 'resolve-funds';
  readonly phase = 'preflight' as const;

  constructor(
    private readonly cashFundResolver: CashFundResolverService,
    private readonly documentNumbering: DocumentNumberingService,
    private readonly voucherService: VoucherService,
  ) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    const invoice = ctx.invoice;
    if (!invoice) {
      throw new Error(
        'resolve-funds ran before load-draft populated the context',
      );
    }

    const hasCash = ctx.input.payments.some(
      (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
    );

    const cashAccountId = hasCash
      ? await this.resolveCashFund(ctx, invoice.branchId)
      : undefined;

    await this.validateNumberingRule(ctx, invoice.branchId);

    if (ctx.input.voucherCode) {
      await this.validateVoucher(ctx, invoice);
    }

    ctx.funds = { cashAccountId };
  }

  private async resolveCashFund(
    ctx: CheckoutContext,
    branchId: string | undefined,
  ): Promise<string> {
    try {
      return await this.cashFundResolver.resolveBranchCashFund(
        ctx.actor.organizationId,
        branchId,
      );
    } catch (err) {
      if (err instanceof BadRequestException) {
        const response = err.getResponse();
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: string }).message ?? err.message);
        throw new BadRequestException({
          code: 'CASH_FUND_NOT_CONFIGURED',
          message,
        });
      }
      throw err;
    }
  }

  /** Result discarded — only used to fail early on a missing/unprovisionable rule. */
  private async validateNumberingRule(
    ctx: CheckoutContext,
    branchId: string | undefined,
  ): Promise<void> {
    try {
      await this.documentNumbering.preview(
        DocumentType.INVOICE,
        branchId,
        ctx.actor,
      );
    } catch (err) {
      if (err instanceof NotFoundException) {
        const response = err.getResponse();
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: string }).message ?? err.message);
        throw new BadRequestException({
          code: 'DOC_NUMBER_RULE_MISSING',
          message,
        });
      }
      throw err;
    }
  }

  /**
   * Folds the voucher's discount into `invoice.discountAmount` — the same
   * field a cashier-entered manual discount already sits in — so
   * `compute-totals` (an unmodified, later preflight step) never needs to
   * know a voucher exists at all; it only ever reads whatever ends up on
   * that column. Cap-at-subtotal matches `PromotionApplyService.apply`
   * exactly (`Math.min(faceValue, subtotal)`) so v1 and v2 land on the same
   * number for the same voucher.
   *
   * `VoucherService.validate` throws `NotFoundException` for an unknown code
   * and a plain-string `BadRequestException` for every other invalid state
   * (used, inactive, expired, wrong customer) — both wrapped here into the
   * `{ code }` shape, same as the other two validations in this step (A-22).
   */
  private async validateVoucher(
    ctx: CheckoutContext,
    invoice: InvoiceEntity,
  ): Promise<void> {
    let voucher;
    try {
      voucher = await this.voucherService.validate(
        ctx.input.voucherCode!,
        invoice.customerId,
        ctx.actor,
      );
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        const response = err.getResponse();
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: string }).message ?? err.message);
        throw new BadRequestException({ code: 'VOUCHER_INVALID', message });
      }
      throw err;
    }

    ctx.voucherId = voucher.id;
    const voucherDiscount = Math.min(Number(voucher.faceValue), Number(invoice.subtotal));
    invoice.discountAmount = round(Number(invoice.discountAmount ?? 0) + voucherDiscount);
  }
}
