import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  DocumentType,
  SessionStatus,
  WsEventType,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { CashFromPaymentPublisher } from '../../accounting/publishers/cash-from-payment.publisher';
import { CashRefundPublisher } from '../../accounting/publishers/cash-refund.publisher';
import { DepositRefundPublisher } from '../../accounting/publishers/deposit-refund.publisher';
import { JournalReturnPublisher } from '../../accounting/publishers/journal-return.publisher';
import { LoyaltyPointsPublisher } from '../../customer/publishers/loyalty-points.publisher';
import { LoyaltyPointsReversePublisher } from '../../customer/publishers/loyalty-points-reverse.publisher';
import { StockDeductionPublisher } from '../../inventory/publishers/stock-deduction.publisher';
import { TempWarehouseFulfillPublisher } from '../../inventory/publishers/temp-warehouse-fulfill.publisher';
import { CustomerCreditService } from '../../customer/services/customer-credit.service';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import {
  AccountingDefaultAccountRole,
  PaymentAccountMethod,
} from '../../accounting/payment-accounts/enums';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
  RefundMethod,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import {
  InvoiceDebtEntity,
  DebtStatus,
  DebtDocumentType,
} from '../entities/invoice-debt.entity';
import { PosSessionEntity } from '../entities/pos-session.entity';
import { CheckoutReturnDto } from '../dto/checkout-return.dto';
import { InvoiceDebtService } from './invoice-debt.service';
import { ReturnPostedPublisher } from '../publishers/return-posted.publisher';
import { StockReturnInPublisher } from '../publishers/stock-return-in.publisher';
import { POINT_EARN_VND_PER_POINT } from '../../customer/loyalty.constants';
import {
  refundableFactor,
  refundableUnitValues,
} from './refundable-value.util';

interface ComputedTotals {
  /** Gross value of the returned lines. A gate and a display value, not a base. */
  returnSubtotal: number;
  newSubtotal: number;
  /** What the customer actually paid for the returned lines — the money base. */
  returnedNet: number;
  netAmount: number;
  refundedAmount: number;
}

const RETURN_INVOICE_TYPES = new Set<InvoiceType>([
  InvoiceType.RETURN,
  InvoiceType.EXCHANGE,
]);

/** POS payment method → payment-account config method. Values are identical
 * strings; this map keeps the two enums decoupled at the type level. */
const PAYMENT_METHOD_TO_ACCOUNT_METHOD: Record<
  InvoicePaymentMethod,
  PaymentAccountMethod
> = {
  [InvoicePaymentMethod.CASH]: PaymentAccountMethod.CASH,
  [InvoicePaymentMethod.BANK_TRANSFER]: PaymentAccountMethod.BANK_TRANSFER,
  [InvoicePaymentMethod.CARD]: PaymentAccountMethod.CARD,
};

@Injectable()
export class CheckoutReturnService {
  private readonly logger = new Logger(CheckoutReturnService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(PosSessionEntity)
    private readonly sessionRepo: Repository<PosSessionEntity>,
    @InjectRepository(InvoiceDebtEntity)
    private readonly debtRepo: Repository<InvoiceDebtEntity>,
    private readonly dataSource: DataSource,
    private readonly numbering: DocumentNumberingService,
    private readonly wsEmitter: WebSocketEmitterService,
    private readonly customerCredit: CustomerCreditService,
    private readonly accountResolver: AccountResolverService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly invoiceDebtService: InvoiceDebtService,
    private readonly returnPostedPublisher: ReturnPostedPublisher,
    private readonly stockReturnInPublisher: StockReturnInPublisher,
    private readonly stockDeductionPublisher: StockDeductionPublisher,
    private readonly tempWarehouseFulfillPublisher: TempWarehouseFulfillPublisher,
    private readonly cashRefundPublisher: CashRefundPublisher,
    private readonly depositRefundPublisher: DepositRefundPublisher,
    private readonly cashFromPaymentPublisher: CashFromPaymentPublisher,
    private readonly journalReturnPublisher: JournalReturnPublisher,
    private readonly loyaltyPointsPublisher: LoyaltyPointsPublisher,
    private readonly loyaltyPointsReversePublisher: LoyaltyPointsReversePublisher,
    private readonly membershipCardService: MembershipCardService,
  ) {}

  async checkout(
    id: string,
    dto: CheckoutReturnDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    if (!invoice.isDraft || invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Invoice ${id} is not a draft and cannot be checked out`,
      );
    }
    if (!RETURN_INVOICE_TYPES.has(invoice.type)) {
      throw new BadRequestException(
        `Invoice ${id} is type ${invoice.type}, only RETURN/EXCHANGE accepted here`,
      );
    }

    const items = await this.itemRepo.find({
      where: { invoiceId: id },
      order: { sortOrder: 'ASC' },
    });
    if (items.length === 0) {
      throw new BadRequestException(`Invoice ${id} has no items`);
    }

    const itemsMissingLocation = items.filter((i) => !i.locationId);
    if (itemsMissingLocation.length > 0) {
      throw new BadRequestException(
        `Invoice ${id} has items without an assigned location: ${itemsMissingLocation
          .map((i) => i.itemId)
          .join(', ')}`,
      );
    }

    // Load the original invoice up-front — needed for the debt settlement, the
    // loyalty re-credit below, and the refund amount
    // itself (computeTotals prorates the original's net onto the returned
    // lines, so it must run after this).
    let originalInvoice: InvoiceEntity | null = null;
    let originalItems: InvoiceItemEntity[] = [];
    if (invoice.originalInvoiceId) {
      originalInvoice = await this.invoiceRepo.findOne({
        where: {
          id: invoice.originalInvoiceId,
          organizationId: actor.organizationId,
        },
      });
      if (originalInvoice) {
        originalItems = await this.itemRepo.find({
          where: { invoiceId: originalInvoice.id },
        });
      }
    }

    const totals = this.computeTotals(items, originalInvoice, originalItems);

    // `refundMethod` no longer decides the fate of the whole refund — it names the
    // fund that pays out whatever is left AFTER the original invoice's debt has
    // been settled. Settling that debt is not the operator's choice any more: it
    // is the first charge on every refund, computed under a lock inside the
    // transaction below. `OFFSET` from an older POS build is therefore just an
    // alias for CASH — the split produces the same document either way.
    const effectiveRefundMethod =
      dto.refundMethod === RefundMethod.OFFSET
        ? RefundMethod.CASH
        : dto.refundMethod;

    this.validateRefundMatrix(invoice, dto, totals, effectiveRefundMethod);

    // EXCHANGE net > 0: the customer owes the difference. They may pay it in full,
    // or (with a customer on file) pay part/none and put the remainder on debt —
    // same model as a debt sale. validateRefundMatrix already enforced the guards.
    const netPaid =
      totals.netAmount > 0
        ? Number(
            (dto.payments ?? [])
              .reduce((s, p) => s + Number(p.amount), 0)
              .toFixed(2),
          )
        : 0;
    const exchangeDebtAmount =
      totals.netAmount > 0
        ? Number((totals.netAmount - netPaid).toFixed(2))
        : 0;

    // Unlocked pre-read of the original invoice's debt, used only to decide which
    // accounts and funds to resolve BEFORE the transaction, so a missing config
    // fails fast instead of half-way through posting. The authoritative read is
    // the locked one inside the transaction; a debt receipt landing in between can
    // only shrink the remainder, which is handled where the split is applied.
    const preReadDebt =
      originalInvoice && totals.refundedAmount > 0
        ? await this.debtRepo.findOne({
            where: {
              invoiceId: originalInvoice.id,
              organizationId: actor.organizationId,
              documentType: DebtDocumentType.CREDIT_INVOICE,
            },
          })
        : null;
    const estimatedOffset = this.offsetFor(preReadDebt, totals.refundedAmount);
    const estimatedCashOut = Number(
      (totals.refundedAmount - estimatedOffset).toFixed(2),
    );

    // Resolve the AR (receivable) COA account server-side (branch override → org
    // default) so the FE never supplies it — both for the part of a refund that
    // settles an existing debt, and for an EXCHANGE net > 0 booked as new
    // customer debt.
    const needsReceivable = estimatedOffset > 0 || exchangeDebtAmount > 0;
    const receivableAccountId = needsReceivable
      ? (dto.receivableAccountId ??
        (await this.accountResolver.resolveDefaultAccount(
          AccountingDefaultAccountRole.RECEIVABLE,
          actor,
        )))
      : dto.receivableAccountId;

    const realCode = await this.numbering.generate(
      DocumentType.RETURN,
      invoice.branchId,
      actor,
    );

    // One cash fund per branch: resolve it only when a cash movement is needed
    // (a cash refund that survives the debt offset, or an exchange with a positive
    // net paid in cash). A refund swallowed whole by the debt moves no cash, so a
    // branch is not forced to have a configured fund for it.
    const needsCashFund =
      (effectiveRefundMethod === RefundMethod.CASH && estimatedCashOut > 0) ||
      (totals.netAmount > 0 && this.hasCashPayments(dto));
    let resolvedCashAccountId = needsCashFund
      ? await this.cashFundResolver.resolveBranchCashFund(
          actor.organizationId,
          invoice.branchId,
        )
      : undefined;

    // BANK refund: resolve the deposit fund from the operator's chosen payment
    // account (payment_accounts.id) server-side, so the refund lands on the
    // exact bank/deposit fund the "Sổ chi tiết tiền gửi" ledger displays. Resolve
    // before the transaction so an invalid/unlinked mapping fails fast.
    let resolvedDepositAccountId: string | undefined;
    if (effectiveRefundMethod === RefundMethod.BANK && estimatedCashOut > 0) {
      const resolved = await this.accountResolver.resolvePaymentAccountById(
        dto.refundAccountId!,
        actor,
      );
      if (!resolved.depositAccountId) {
        throw new BadRequestException(
          'Tài khoản hoàn tiền chưa liên kết quỹ tiền gửi',
        );
      }
      resolvedDepositAccountId = resolved.depositAccountId;
    }

    // Resolve the receiving COA account for each EXCHANGE payment line — the
    // same server-side derivation as a normal sale checkout: the client sends a
    // configured `payment_accounts` row id (which bank a transfer hit), never a
    // raw COA id. Resolve before the transaction so an invalid/ambiguous mapping
    // fails fast. Index-aligned with dto.payments.
    const resolvedPaymentAccountIds: string[] = [];
    if (totals.netAmount > 0 && dto.payments && dto.payments.length > 0) {
      const resolvedByKey = new Map<string, string>();
      for (const p of dto.payments) {
        const cacheKey = p.paymentAccountId ?? `default:${p.paymentMethod}`;
        let accountId = resolvedByKey.get(cacheKey);
        if (!accountId) {
          const resolved = await this.accountResolver.resolvePaymentAccount(
            PAYMENT_METHOD_TO_ACCOUNT_METHOD[p.paymentMethod],
            actor,
            p.paymentAccountId,
          );
          accountId = resolved.accountId;
          resolvedByKey.set(cacheKey, accountId);
        }
        resolvedPaymentAccountIds.push(accountId);
      }
    }

    const now = new Date();

    const posted = await this.dataSource.transaction(async (manager) => {
      // The debt offset is the first charge on every refund, ahead of any cash
      // leaving the till. Reading the row FOR UPDATE inside the transaction is
      // what makes `offsetAmount` impossible to overshoot: a concurrent debt
      // receipt either lands before this read (smaller remainder, smaller offset)
      // or waits for the commit.
      const originalDebt = await this.lockOriginalDebt(
        manager,
        originalInvoice,
        totals.refundedAmount,
      );
      const offsetAmount = this.offsetFor(originalDebt, totals.refundedAmount);
      const cashOutAmount = Number(
        (totals.refundedAmount - offsetAmount).toFixed(2),
      );

      invoice.isDraft = false;
      invoice.status =
        exchangeDebtAmount > 0
          ? netPaid > 0
            ? InvoiceStatus.PARTIAL_DEBT
            : InvoiceStatus.DEBT
          : InvoiceStatus.PAID;
      invoice.issuedAt = now;
      invoice.code = realCode;
      invoice.subtotal = totals.newSubtotal || totals.returnSubtotal;
      invoice.amountDue = Math.max(totals.netAmount, 0);
      invoice.totalPaid = totals.netAmount > 0 ? netPaid : 0;
      invoice.refundMethod = effectiveRefundMethod;
      invoice.refundedAmount = totals.refundedAmount;
      invoice.offsetAmount = offsetAmount;
      invoice.netAmount = totals.netAmount;
      // Loyalty earn is on the newly purchased (OUT) goods — a "Mua thêm" line is
      // a real sale and earns on its own value, independent of what was returned
      // (the return is reversed separately in fanOutEvents). RETURN/refund has no
      // OUT lines, so newSubtotal = 0 and this earns nothing.
      invoice.pointsEarned = Math.floor(
        totals.newSubtotal / POINT_EARN_VND_PER_POINT,
      );
      // Snapshot the points clawed back on the returned goods so receipts can show
      // "Điểm trừ" without querying point_history. Same base as the reverse event.
      invoice.pointsReversed = this.computeReversePoints(originalInvoice, totals);
      // Balance this document leaves the customer on: the locked card balance
      // plus everything this transaction is about to apply (creditBack, below)
      // and everything the async consumers will apply (earn / reverse). The
      // reverse consumer caps its decrement at the available balance, which the
      // max(0, …) clamp reproduces.
      const creditBack = this.computeRedeemedCreditBack(originalInvoice, totals);
      const cardBalance = invoice.customerId
        ? await this.membershipCardService.getPointBalanceForUpdate(
            invoice.customerId,
            manager,
            actor,
          )
        : null;
      invoice.pointsBalanceAfter =
        cardBalance == null
          ? null
          : Math.max(
              0,
              cardBalance +
                creditBack +
                invoice.pointsEarned -
                invoice.pointsReversed,
            );
      if (dto.note) invoice.note = dto.note;
      const savedInvoice = await manager.save(invoice);

      // Atomic returned_quantity guard on each original SALE line referenced.
      const inLines = items.filter((it) => it.direction === ItemDirection.IN);

      // Record the promotion carried over from the original invoice onto each
      // returned line. The refund is already computed net of it; persisting it
      // means every screen that opens this document afterwards can show the
      // list price alongside what the customer actually paid, instead of having
      // to reach back into the original invoice to re-derive it.
      if (originalInvoice && originalItems.length) {
        const perUnitRefund = refundableUnitValues(originalInvoice, originalItems);
        const touched: InvoiceItemEntity[] = [];
        for (const line of inLines) {
          const unit = line.originalInvoiceItemId
            ? perUnitRefund.get(line.originalInvoiceItemId)
            : undefined;
          if (unit === undefined) continue;
          const allocated =
            Math.round(
              (Number(line.lineTotal) - unit * Number(line.quantity)) * 100,
            ) / 100;
          if (allocated > 0) {
            line.promotionDiscount = allocated;
            touched.push(line);
          }
        }
        if (touched.length) await manager.save(touched);
      }
      for (const line of inLines) {
        if (!line.originalInvoiceItemId) continue; // QUICK return — skip
        const qty = Number(line.quantity);
        const result = await manager.query(
          `UPDATE invoice_items
              SET returned_quantity = returned_quantity + $1
            WHERE id = $2
              AND returned_quantity + $1 <= quantity`,
          [qty, line.originalInvoiceItemId],
        );
        const rowCount = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
        if (rowCount !== 1) {
          throw new ConflictException(
            `Vượt số lượng có thể trả cho line ${line.originalInvoiceItemId}`,
          );
        }
      }

      // Save InvoicePayment rows when EXCHANGE net > 0.
      let savedPayments: InvoicePaymentEntity[] = [];
      if (totals.netAmount > 0 && dto.payments && dto.payments.length > 0) {
        const paymentEntities = dto.payments.map((p, idx) =>
          manager.create(InvoicePaymentEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            invoiceId: savedInvoice.id,
            paymentMethod: p.paymentMethod,
            amount: p.amount,
            accountId: resolvedPaymentAccountIds[idx],
            reference: p.reference,
          }),
        );
        savedPayments = await manager.save(paymentEntities);
      }

      // EXCHANGE net > 0 paid partially/none → book the remainder as customer
      // debt (same mechanism as a debt sale). Requires a customer (guarded in
      // validateRefundMatrix); createFromInvoice is idempotent by invoiceId.
      if (exchangeDebtAmount > 0) {
        await this.invoiceDebtService.createFromInvoice(
          savedInvoice,
          exchangeDebtAmount,
          manager,
          { dueDate: dto.dueDate, creditDays: dto.creditDays },
        );
      }

      // STORE_CREDIT issuance.
      if (
        effectiveRefundMethod === RefundMethod.STORE_CREDIT &&
        totals.refundedAmount > 0
      ) {
        await this.customerCredit.issue(
          savedInvoice,
          totals.refundedAmount,
          manager,
        );
      }

      // Settle the original sale's debt with the offset share. The locked row is
      // the only authority here — the original invoice's `status` is not consulted,
      // because a stale status must never be able to pay money out twice.
      if (offsetAmount > 0 && originalDebt && originalInvoice) {
        await this.applyOffsetToDebt(manager, originalDebt, offsetAmount, now);
        // Record the return as its own debt-ledger row so it is visible and
        // clickable in the customer's debt (Công nợ) tab, keyed on the return id.
        await this.createReturnDebtAdjustment(
          manager,
          savedInvoice,
          originalInvoice,
          offsetAmount,
          now,
        );
      }

      // Re-credit loyalty points that were redeemed on the original sale,
      // proportional to the returned value (floored, so multiple partial returns
      // never re-credit more than was redeemed). Additive and safe, so it runs
      // in-transaction — distinct from the earn-reversal fanned out as an event.
      if (invoice.customerId && creditBack > 0) {
        await this.membershipCardService.refundRedeemedPoints(
          {
            customerId: invoice.customerId,
            points: creditBack,
            invoiceId: savedInvoice.id,
          },
          manager,
          actor,
        );
      }

      return {
        invoice: savedInvoice,
        payments: savedPayments,
        cashOutAmount,
      };
    });

    // The pre-read said no cash would move, but the locked read disagreed (a debt
    // receipt landed in between and shrank the remainder). Resolve the fund now so
    // the money still reaches the customer.
    if (
      effectiveRefundMethod === RefundMethod.CASH &&
      posted.cashOutAmount > 0 &&
      !resolvedCashAccountId
    ) {
      resolvedCashAccountId = await this.cashFundResolver.resolveBranchCashFund(
        actor.organizationId,
        invoice.branchId,
      );
    }

    // Fan-out events (after commit).
    await this.fanOutEvents(
      posted.invoice,
      posted.payments,
      items,
      totals,
      posted.cashOutAmount,
      dto,
      effectiveRefundMethod,
      receivableAccountId,
      resolvedCashAccountId,
      resolvedDepositAccountId,
      originalInvoice,
      actor,
    );

    this.wsEmitter.emitToBranch(invoice.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_CHECKOUT_ACKNOWLEDGED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: posted.invoice.id,
      payload: {
        invoiceId: posted.invoice.id,
        documentNumber: realCode,
        type: invoice.type,
        refundedAmount: totals.refundedAmount,
        netAmount: totals.netAmount,
      },
    });

    this.logger.log(
      `Checked out ${invoice.type} invoice ${id} code=${realCode} method=${effectiveRefundMethod} refunded=${totals.refundedAmount} net=${totals.netAmount} pointsReversed=${posted.invoice.pointsReversed}`,
    );

    return posted.invoice;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * `returnSubtotal` stays GROSS, but only as a gate (`> 0`) and as the value
   * shown on `invoice.subtotal`. It is NOT a money base and no longer a loyalty
   * base either: `computeReverseBase` moved onto `returnedNet` so that money and
   * points on one return document stand on the same footing.
   *
   * `returnedNet` is what the customer actually paid for the returned goods:
   *
   *   netLine(i)     = lineTotal(i) − promotionDiscount(i)
   *   headerResidual = pointsDiscountAmount + depositAmount
   *                  + max(0, discountAmount − Σ promotionDiscount)
   *   share          = returnedNet / Σ netLine
   *   refund         = returnedNet − headerResidual × share
   *
   * A full return therefore lands exactly on the original's `amountDue`, which
   * is the invariant the tests pin.
   *
   * Deliberately NOT capped at the original's `totalPaid`: debt repayments are
   * recorded in `debt_payments` and never written back to `invoices.total_paid`
   * (see invoice-debt.service), so a credit sale settled in full still reads
   * `totalPaid = 0`. Capping on it would refund such a customer nothing.
   *
   * `refundedAmount` is the whole value handed back, which is NOT the same as the
   * money that leaves the till. The caller splits it — debt first, remainder in
   * cash — and that split is what keeps the payout within what was collected:
   * since `remainingAmount = amountDue − collected`, paying out
   * `refunded − min(refunded, remaining)` can never exceed `collected`. No cap on
   * this number is needed, and none based on `totalPaid` would be correct.
   *
   * Falls back to the gross behaviour when there is no original invoice (QUICK
   * return); degrades to a plain proration of `amountDue` for v1 invoices,
   * where every promotionDiscount is 0.
   */
  private computeTotals(
    items: InvoiceItemEntity[],
    originalInvoice: InvoiceEntity | null = null,
    originalItems: InvoiceItemEntity[] = [],
  ): ComputedTotals {
    const round = (v: number) => Math.round(v * 100) / 100;

    let returnSubtotal = 0;
    let newSubtotal = 0;
    for (const it of items) {
      const total = Number(it.lineTotal);
      if (it.direction === ItemDirection.IN) returnSubtotal += total;
      else newSubtotal += total;
    }
    returnSubtotal = round(returnSubtotal);
    newSubtotal = round(newSubtotal);

    const returnedNet = this.computeReturnedNet(
      items,
      originalInvoice,
      originalItems,
      returnSubtotal,
    );

    const netAmount = round(newSubtotal - returnedNet);
    const refundedAmount = round(Math.max(returnedNet - newSubtotal, 0));
    return { returnSubtotal, newSubtotal, returnedNet, netAmount, refundedAmount };
  }

  /**
   * Value of the returned (IN) lines net of every discount the customer never
   * paid — the promotion allocated to each line, plus that share of the
   * invoice-level residual (points, deposit, manual invoice discount).
   */
  private computeReturnedNet(
    items: InvoiceItemEntity[],
    originalInvoice: InvoiceEntity | null,
    originalItems: InvoiceItemEntity[],
    returnSubtotal: number,
  ): number {
    const round = (v: number) => Math.round(v * 100) / 100;
    if (returnSubtotal <= 0) return 0;
    // QUICK return: nothing to prorate against, keep the gross behaviour.
    if (!originalInvoice || originalItems.length === 0) return returnSubtotal;

    // The per-unit refundable values POS was handed when the cart was built, so
    // the amount charged here is the amount the cashier saw and collected.
    const perUnit = refundableUnitValues(originalInvoice, originalItems);
    const factor = refundableFactor(originalInvoice, originalItems);
    const sumNetLine = originalItems.reduce(
      (sum, it) => sum + Number(it.lineTotal) - Number(it.promotionDiscount ?? 0),
      0,
    );
    if (sumNetLine <= 0) return returnSubtotal;

    // Lines with no traceable original (or v1 invoices, where promotionDiscount
    // is 0 throughout) fall back to their gross amount, which is exactly what
    // the old behaviour produced.
    let returnedNet = 0;
    for (const it of items) {
      if (it.direction !== ItemDirection.IN) continue;
      const unit = it.originalInvoiceItemId
        ? perUnit.get(it.originalInvoiceItemId)
        : undefined;
      returnedNet +=
        unit === undefined
          ? Number(it.lineTotal) * factor
          : unit * Number(it.quantity);
    }

    return round(Math.max(0, returnedNet));
  }

  /**
   * Money base for the loyalty points clawed back on the returned (IN) goods.
   *
   * A sale earns on its `amountDue` — `floor(amountDue / POINT_EARN_VND_PER_POINT)`
   * in both checkout paths (`checkout-invoice.service.ts` for v1,
   * `compute-totals.step.ts` for the v2 saga). A return therefore has to claw back
   * on the same net basis, and `returnedNet` already *is* the slice of `amountDue`
   * being handed back:
   *
   *   Σ netLine − headerResidual
   *     = (subtotal − Σpromo) − (pointsDiscount + deposit + (discountAmount − Σpromo))
   *     = subtotal − discountAmount − pointsDiscount − deposit
   *     = amountDue
   *
   * so `amountDue × returnedNet / (Σ netLine − headerResidual)` collapses to
   * `returnedNet`. No proration left to do.
   *
   * The gross basis this replaced (`amountDue × returnSubtotal / subtotal`) agreed
   * with the net one whenever the promotion was spread evenly across the lines, or
   * the whole invoice came back — which is why the error stayed invisible for so
   * long. It diverged on a PARTIAL return of an UNEVENLY promoted invoice, taking
   * more points off the promoted line than that line had ever earned and leaving
   * the customer short on goods they still owned.
   *
   * The no-original branch is NOT dead code: a QUICK return has nothing to prorate
   * against, and `computeReturnedNet` degrades to the gross value there. Keep it.
   *
   * Shared by the on-invoice `pointsReversed` snapshot and the reverse event, so
   * both agree.
   */
  private computeReverseBase(
    originalInvoice: InvoiceEntity | null,
    totals: ComputedTotals,
  ): number {
    if (totals.returnSubtotal <= 0) return 0;
    return originalInvoice
      ? totals.returnedNet
      : Math.abs(totals.refundedAmount || totals.returnSubtotal);
  }

  /**
   * How many loyalty points this return claws back.
   *
   * The money basis above answers "how much value came back", and dividing it by
   * the earn rate used to answer "how many points" too — correct only while every
   * invoice satisfied `pointsEarned = floor(amountDue / rate)`. A promotion with
   * "Tích điểm cho khách hàng" unchecked breaks that identity: money moves, nothing
   * is earned. Reversing on money alone then takes points the sale never granted,
   * which is what cancelling did in QA #16.
   *
   * So: derive from money as before, then cap at what the original actually
   * recorded (ADR-02). A blocked original caps to 0. A full return caps to exactly
   * `pointsEarned`. A partial return sits below the cap and keeps the number it has
   * today — which is why this is a cap and not a re-proration of `pointsEarned`:
   * prorating rounds differently and would move expectations this file pins, for no
   * correctness gain.
   *
   * The cap only works because `invoices.points_earned` can be trusted. It could
   * not before `BackfillInvoicePointsEarnedFromLedger1789000000000`: 27 invoices
   * read 0 while the ledger held a real earn, and capping on them would have
   * refused to reverse 3.439 points — the mirror image of the defect being fixed.
   * That migration is why UOW-05 blocks this code, and why it ships as a migration
   * rather than an ops script (ADR-05).
   *
   * The cap is one-way. It can never reverse more than was earned, and makes no
   * attempt to detect an under-earn — not a defect class that exists here.
   *
   * QUICK returns have no original invoice and therefore no recorded earn to cap
   * against, so they keep the uncapped derivation. The caller logs when that happens.
   *
   * Shared by the on-invoice `pointsReversed` snapshot and the reverse event, so the
   * two can never disagree the way the cancel path's did.
   */
  private computeReversePoints(
    originalInvoice: InvoiceEntity | null,
    totals: ComputedTotals,
  ): number {
    const derived = Math.floor(
      this.computeReverseBase(originalInvoice, totals) / POINT_EARN_VND_PER_POINT,
    );
    return originalInvoice
      ? Math.min(derived, Number(originalInvoice.pointsEarned ?? 0))
      : derived;
  }

  /**
   * Loyalty points redeemed on the ORIGINAL sale that are given back on this
   * return, in proportion to the money actually handed back.
   *
   * The ratio is `returnedNet / amountDue`, the same pairing `computeReverseBase`
   * relies on: `amountDue` is by definition `Σ netLine − headerResidual`, which is
   * the denominator `returnedNet` was measured against. Prorating on
   * `Σ netLine` instead would drop `headerResidual` from the denominator only, and
   * a full return would then give back less than the customer actually spent.
   *
   * Floored, so several partial returns can never re-credit more than was
   * redeemed — the sum of the parts lands at or just under the whole.
   *
   * `amountDue = 0` is a real invoice, not a hypothetical: a sale settled entirely
   * with points leaves no money basis to prorate against (INV-202608-00010 on dev
   * is exactly that). Fall back to the gross share there, which is the only ratio
   * such an invoice still expresses.
   *
   * Shared by the `pointsBalanceAfter` snapshot and the actual
   * refundRedeemedPoints call, so both agree.
   */
  private computeRedeemedCreditBack(
    originalInvoice: InvoiceEntity | null,
    totals: ComputedTotals,
  ): number {
    if (
      !originalInvoice ||
      Number(originalInvoice.pointsRedeemed) <= 0 ||
      totals.returnSubtotal <= 0
    ) {
      return 0;
    }
    const pointsRedeemed = Number(originalInvoice.pointsRedeemed);
    const amountDue = Number(originalInvoice.amountDue);
    if (amountDue <= 0) {
      const originalSubtotal = Number(originalInvoice.subtotal ?? 0);
      if (originalSubtotal <= 0) return 0;
      return Math.floor(
        (pointsRedeemed * totals.returnSubtotal) / originalSubtotal,
      );
    }
    return Math.floor((pointsRedeemed * totals.returnedNet) / amountDue);
  }

  private validateRefundMatrix(
    invoice: InvoiceEntity,
    dto: CheckoutReturnDto,
    totals: ComputedTotals,
    effectiveRefundMethod: RefundMethod,
  ): void {
    const { netAmount, refundedAmount } = totals;

    if (netAmount > 0) {
      // EXCHANGE net > 0 — khách trả thêm phần chênh. Thu đủ, hoặc thu một phần /
      // không thu và ghi phần còn lại vào công nợ (giống đơn bán nợ).
      const paid = Number(
        (dto.payments ?? []).reduce((s, p) => s + Number(p.amount), 0).toFixed(2),
      );
      if (paid > netAmount) {
        throw new BadRequestException(
          `Tổng payments (${paid}) vượt netAmount (${netAmount})`,
        );
      }
      if (paid < netAmount && !invoice.customerId) {
        throw new BadRequestException(
          'Ghi phần chênh đổi hàng vào công nợ yêu cầu invoice có customerId',
        );
      }
      if (refundedAmount !== 0) {
        // Shouldn't happen given math, but guard.
        throw new BadRequestException(
          'Internal inconsistency: net > 0 implies refundedAmount = 0',
        );
      }
    } else if (netAmount < 0) {
      // RETURN or EXCHANGE refund. OFFSET is not listed: the caller has already
      // mapped it onto CASH, because settling debt is no longer a payout method.
      if (
        effectiveRefundMethod !== RefundMethod.CASH &&
        effectiveRefundMethod !== RefundMethod.BANK &&
        effectiveRefundMethod !== RefundMethod.STORE_CREDIT
      ) {
        throw new BadRequestException(
          `refundMethod ${effectiveRefundMethod} không hợp lệ khi netAmount<0`,
        );
      }
      if (effectiveRefundMethod === RefundMethod.BANK && !dto.refundAccountId) {
        throw new BadRequestException(
          'BANK refund yêu cầu refundAccountId (tài khoản nhận hoàn)',
        );
      }
      if (
        effectiveRefundMethod === RefundMethod.STORE_CREDIT &&
        !invoice.customerId
      ) {
        throw new BadRequestException(
          'STORE_CREDIT yêu cầu invoice có customerId',
        );
      }
      if (
        effectiveRefundMethod === RefundMethod.STORE_CREDIT &&
        !dto.creditLiabilityAccountId
      ) {
        throw new BadRequestException(
          'STORE_CREDIT yêu cầu creditLiabilityAccountId',
        );
      }
      // The receivable account for a debt settlement is resolved server-side
      // (org AR default) — the FE never needs to supply it.
      if (dto.payments && dto.payments.length > 0) {
        throw new BadRequestException(
          'payments không được cung cấp khi netAmount <= 0',
        );
      }
    } else {
      // netAmount === 0 — đổi hàng ngang giá. refundedAmount = 0 nên không có chuyển
      // động tiền/công nợ/store-credit nào; refundMethod là no-op ở đây. Chỉ cần chặn
      // payments vì không có gì để thu.
      if (dto.payments && dto.payments.length > 0) {
        throw new BadRequestException(
          'payments không được cung cấp khi netAmount = 0',
        );
      }
    }
  }

  private hasCashPayments(dto: CheckoutReturnDto): boolean {
    return !!dto.payments?.some(
      (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
    );
  }

  private async findActiveSession(
    actor: ActorContext,
  ): Promise<PosSessionEntity | null> {
    return this.sessionRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        openedBy: actor.userId,
        status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
      },
    });
  }

  /**
   * The original SALE invoice's credit-debt row, locked for update.
   *
   * Filtered to CREDIT_INVOICE so it can never pick up an ADJUSTMENT marker: those
   * are keyed on a *return* invoice id, but the filter costs nothing and removes a
   * whole category of "why did the debt move twice" incident.
   */
  private async lockOriginalDebt(
    manager: EntityManager,
    originalInvoice: InvoiceEntity | null,
    refundedAmount: number,
  ): Promise<InvoiceDebtEntity | null> {
    if (!originalInvoice || refundedAmount <= 0) return null;
    return manager.findOne(InvoiceDebtEntity, {
      where: {
        invoiceId: originalInvoice.id,
        organizationId: originalInvoice.organizationId,
        documentType: DebtDocumentType.CREDIT_INVOICE,
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * How much of a refund goes to settling debt rather than leaving the till.
   *
   * This single `min` is what makes the whole feature safe: because
   * `remainingAmount = amountDue − (everything the customer has actually paid)`,
   * paying out `refunded − offset` can never exceed what was collected. No cap on
   * `invoices.total_paid` is needed — and none would work, since debt repayments
   * are recorded in `debt_payments` and never written back to that column.
   */
  private offsetFor(
    debt: InvoiceDebtEntity | null,
    refundedAmount: number,
  ): number {
    if (!debt || refundedAmount <= 0) return 0;
    if (debt.status === DebtStatus.PAID) return 0;
    const remaining = Math.max(0, Number(debt.remainingAmount));
    return Number(Math.min(refundedAmount, remaining).toFixed(2));
  }

  /** Apply an already-computed offset to a locked debt row. */
  private async applyOffsetToDebt(
    manager: EntityManager,
    debt: InvoiceDebtEntity,
    offsetAmount: number,
    now: Date,
  ): Promise<void> {
    debt.paidAmount = Number(
      (Number(debt.paidAmount) + offsetAmount).toFixed(2),
    );
    debt.remainingAmount = Number(
      (Number(debt.originalAmount) - debt.paidAmount).toFixed(2),
    );
    if (debt.remainingAmount <= 0) {
      debt.remainingAmount = 0;
      debt.status = DebtStatus.PAID;
      debt.settledAt = now;
    }
    await manager.save(debt);
  }

  /**
   * Record the debt settlement as its own `invoice_debts` row so the return
   * invoice is visible and clickable in the customer's debt (Công nợ) tab. This is
   * a settled reduction marker (documentType=adjustment, negative amount, remaining
   * 0), NOT an outstanding receivable — the actual debt reduction is applied to the
   * original sale's debt row by `offsetOriginalDebt`. The unique index on
   * `invoiceId` keeps this idempotent (the return id differs from the sale id).
   */
  private async createReturnDebtAdjustment(
    manager: EntityManager,
    returnInvoice: InvoiceEntity,
    originalInvoice: InvoiceEntity,
    applied: number,
    now: Date,
  ): Promise<void> {
    const row = manager.create(InvoiceDebtEntity, {
      organizationId: returnInvoice.organizationId,
      branchId: returnInvoice.branchId,
      createdBy: returnInvoice.createdBy,
      referenceCode: returnInvoice.code,
      invoiceId: returnInvoice.id,
      customerId: originalInvoice.customerId!,
      documentType: DebtDocumentType.ADJUSTMENT,
      originalAmount: -applied,
      paidAmount: 0,
      remainingAmount: 0,
      issuedAt: now.toISOString().split('T')[0],
      status: DebtStatus.PAID,
      settledAt: now,
      note: `Return offset against original invoice ${originalInvoice.code}`,
    });
    await manager.save(row);
  }

  private async fanOutEvents(
    invoice: InvoiceEntity,
    payments: InvoicePaymentEntity[],
    items: InvoiceItemEntity[],
    totals: ComputedTotals,
    cashOutAmount: number,
    dto: CheckoutReturnDto,
    effectiveRefundMethod: RefundMethod,
    receivableAccountId: string | undefined,
    resolvedCashAccountId: string | undefined,
    resolvedDepositAccountId: string | undefined,
    originalInvoice: InvoiceEntity | null,
    actor: ActorContext,
  ): Promise<void> {
    const branchId = invoice.branchId!;
    const inLines = items.filter((it) => it.direction === ItemDirection.IN);
    const outLines = items.filter((it) => it.direction === ItemDirection.OUT);

    // Revenue (contra for refund JEs + journal-return) is resolved server-side —
    // the FE never supplies a COA id (same as checkout-invoice). This avoids a
    // stale/invalid client account id breaking the cash/deposit refund posting.
    const revenueAccountId = await this.accountResolver.resolveDefaultAccount(
      AccountingDefaultAccountRole.REVENUE,
      actor,
    );

    // 1. STOCK_RETURN_IN — always for IN lines.
    if (inLines.length > 0) {
      await this.stockReturnInPublisher.publish(
        invoice.id,
        invoice.code,
        branchId,
        inLines.map((it) => ({
          itemId: it.itemId,
          locationId: it.locationId!,
          quantity: Number(it.quantity),
        })),
        actor,
      );
    }

    // 2. STOCK_DEDUCTION — EXCHANGE OUT lines.
    if (outLines.length > 0) {
      await this.stockDeductionPublisher.publish(
        invoice.id,
        outLines.map((it) => ({
          itemId: it.itemId,
          locationId: it.locationId!,
          quantity: Number(it.quantity),
        })),
        branchId,
        actor,
      );

      // 2b. TEMP_WAREHOUSE_INVOICE_FULFILL — the second beat every sale already
      // has and this path was missing. The exchange's buy-more (OUT) leg deducts
      // from the showroom exactly like a sale (create-exchange-invoice resolves
      // it with showroomOnly: true), so it needs the same warehouse -> showroom
      // backfill: without it, an item staged in the temp warehouse is sold out of
      // a showroom that never received it, and the balance goes negative.
      //
      // OUT lines only. Returned (IN) stock is credited straight back to the
      // showroom and was never staged, so it has nothing to consume — and netting
      // the two legs would be a rule no other path in this codebase applies.
      // Quantities are stored positive (direction, not sign, separates the legs).
      //
      // Always published when there is an OUT line: the consumer no-ops when the
      // branch has no ACTIVE session or no staged line matches. Deduplication is
      // keyed on this invoice's own id, which is distinct from the original sale's.
      const fulfillByItem = new Map<string, number>();
      for (const item of outLines) {
        fulfillByItem.set(
          item.itemId,
          (fulfillByItem.get(item.itemId) ?? 0) + Number(item.quantity),
        );
      }
      await this.tempWarehouseFulfillPublisher.publish({
        organizationId: actor.organizationId,
        branchId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.code,
        actor: {
          userId: actor.userId,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          roles: actor.roles,
        },
        lines: [...fulfillByItem.entries()].map(([itemId, quantity]) => ({
          itemId,
          quantity,
        })),
      });
    }

    // 3. JOURNAL_POST_RETURN — always. For an EXCHANGE net > 0 the cash portion is
    // booked by the cash-from-payment consumer; the portion put on customer debt is
    // sent here so journal-return can post DR receivable / CR revenue for it.
    const netPaid =
      totals.netAmount > 0
        ? Number(
            payments.reduce((s, p) => s + Number(p.amount), 0).toFixed(2),
          )
        : 0;
    const debtAmount =
      totals.netAmount > 0
        ? Number((totals.netAmount - netPaid).toFixed(2))
        : 0;
    await this.journalReturnPublisher.publish(
      {
        returnInvoiceId: invoice.id,
        returnInvoiceCode: invoice.code,
        source: invoice.type === InvoiceType.EXCHANGE ? 'EXCHANGE' : 'RETURN',
        refundMethod: effectiveRefundMethod,
        refundedAmount: totals.refundedAmount,
        offsetAmount: Number(invoice.offsetAmount ?? 0),
        netAmount: totals.netAmount,
        debtAmount,
        revenueAccountId,
        cashAccountId: resolvedCashAccountId,
        receivableAccountId: receivableAccountId,
        creditLiabilityAccountId: dto.creditLiabilityAccountId,
        branchId,
      },
      actor,
    );

    // 4. CASH_REFUND — only what survives the debt settlement leaves the till.
    // A refund swallowed whole by the debt publishes nothing, so no 0đ voucher
    // ever appears in the cash book.
    if (
      effectiveRefundMethod === RefundMethod.CASH &&
      cashOutAmount > 0 &&
      resolvedCashAccountId
    ) {
      await this.cashRefundPublisher.publish(
        {
          returnInvoiceId: invoice.id,
          returnInvoiceCode: invoice.code,
          cashAccountId: resolvedCashAccountId,
          contraAccountId: revenueAccountId,
          amount: cashOutAmount,
          sessionId: undefined,
          branchId,
        },
        actor,
      );
    }

    // 4b. DEPOSIT_REFUND — refundMethod=BANK AND refundedAmount > 0. Records a
    // deposit WITHDRAWAL on the chosen fund (Sổ chi tiết tiền gửi) + Phiếu chi
    // ngân hàng. The bank leg's JE (DR revenue / CR 112x) is owned by that
    // movement, so journal-return posts nothing for the refunded portion.
    if (
      effectiveRefundMethod === RefundMethod.BANK &&
      cashOutAmount > 0 &&
      resolvedDepositAccountId
    ) {
      await this.depositRefundPublisher.publish(
        {
          returnInvoiceId: invoice.id,
          returnInvoiceCode: invoice.code,
          depositAccountId: resolvedDepositAccountId,
          contraAccountId: revenueAccountId,
          amount: cashOutAmount,
          docDate: (invoice.issuedAt ?? new Date())
            .toISOString()
            .slice(0, 10),
          branchId,
        },
        actor,
      );
    }

    // 5. CASH_MOVEMENT_FROM_PAYMENT — EXCHANGE net > 0 with cash payments.
    if (totals.netAmount > 0 && resolvedCashAccountId) {
      const cashPayments = payments.filter(
        (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
      );
      for (const cp of cashPayments) {
        await this.cashFromPaymentPublisher.publish(
          {
            invoiceId: invoice.id,
            invoicePaymentId: cp.id,
            invoiceCode: invoice.code,
            sessionId: undefined,
            cashAccountId: resolvedCashAccountId,
            contraAccountId: revenueAccountId,
            amount: Number(cp.amount),
            branchId,
          },
          actor,
        );
      }
    }

    // 6. Loyalty — the return (IN) and the new purchase (OUT) are two independent
    // movements on the same invoice, so an equal-value exchange (return A, re-buy
    // A) reverses the returned item's points AND earns them back on the new one,
    // leaving the balance unchanged. Netting them into a single netAmount would
    // swallow the earn whenever net <= 0.
    if (invoice.customerId) {
      // AWARD on the newly purchased (OUT) goods.
      if (totals.newSubtotal > 0) {
        await this.loyaltyPointsPublisher.publish(
          {
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            subtotal: totals.newSubtotal,
            issuedAt: invoice.issuedAt,
            branchId,
          },
          actor,
        );
      }
      // REVERSE the points earned on the ORIGINAL sale, proportional to the
      // returned value — earn was on the original's amountDue (net of its
      // discounts/point-redemption), so reverse on that same base to stay
      // symmetric (full return → floor(amountDue/rate) = points earned). QUICK
      // returns without an original fall back to the gross returned value.
      if (totals.returnSubtotal > 0) {
        const delta = this.computeReverseBase(originalInvoice, totals);
        const reversePoints = this.computeReversePoints(originalInvoice, totals);
        if (!originalInvoice) {
          this.logger.log(
            `Loyalty reverse for ${invoice.id} has no original invoice to cap against ` +
              `(QUICK return); using the uncapped money derivation: ${reversePoints} point(s)`,
          );
        }
        if (delta > 0) {
          await this.loyaltyPointsReversePublisher.publish(
            {
              returnInvoiceId: invoice.id,
              customerId: invoice.customerId,
              subtotalDelta: delta,
              // Same function as the `pointsReversed` snapshot above — the snapshot
              // and the card disagreeing is exactly what QA #16 was.
              points: reversePoints,
              branchId,
            },
            actor,
          );
        }
      }
    }

    // 7. RETURN_POSTED — always.
    await this.returnPostedPublisher.publish(
      {
        returnInvoiceId: invoice.id,
        returnInvoiceCode: invoice.code,
        type: invoice.type === InvoiceType.EXCHANGE ? 'EXCHANGE' : 'RETURN',
        customerId: invoice.customerId,
        branchId,
      },
      actor,
    );
  }
}
