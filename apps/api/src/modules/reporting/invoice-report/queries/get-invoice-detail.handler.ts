import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InvoiceDetailView, PromotionProgramType } from '@erp/shared-interfaces';
import { UserEntity } from '../../../auth/user.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { CustomerGroupEntity } from '../../../customer/customer-group.entity';
import { InvoiceEntity, RefundMethod } from '../../../pos/entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoiceCheckoutPromotionEntity } from '../../../pos/checkout-saga/infrastructure/invoice-checkout-promotion.entity';
import {
  invoiceTypeSign,
  signedGoods,
} from '../../report-core/report-query.util';
import { GetInvoiceDetailQuery } from './get-invoice-detail.query';

/**
 * Apply a sign without producing `-0`, which `Intl.NumberFormat` faithfully
 * renders as "-0" — a refund of nothing should not look like a negative number.
 */
const signed = (sign: number, value: unknown): number => {
  const n = sign * Number(value ?? 0);
  return n === 0 ? 0 : n;
};

/**
 * Programmes that discount particular items — their per-line share belongs in
 * that line's "Tiền KM". Everything else (INVOICE_DISCOUNT, TIERED_DISCOUNT,
 * whose ladder may run on the bill total) is a discount on the bill: the engine
 * still spreads it over the lines, but per item it means nothing, so the dialog
 * shows it once as the invoice's "Khuyến mại".
 */
const ITEM_LEVEL_PROGRAMS = new Set<string>([
  PromotionProgramType.ITEM_DISCOUNT,
  PromotionProgramType.GIFT_ITEM,
  PromotionProgramType.BUY_M_GET_N,
]);

/** How a refund left the shop, as a tender `method` the dialogs already label. */
const REFUND_TENDER: Record<RefundMethod, string> = {
  [RefundMethod.CASH]: 'cash',
  [RefundMethod.BANK]: 'bank_transfer',
  [RefundMethod.STORE_CREDIT]: 'store_credit',
  [RefundMethod.OFFSET]: 'offset',
};

@QueryHandler(GetInvoiceDetailQuery)
export class GetInvoiceDetailHandler
  implements IQueryHandler<GetInvoiceDetailQuery>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly items: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoicePaymentEntity)
    private readonly payments: Repository<InvoicePaymentEntity>,
    @InjectRepository(InvoiceCheckoutPromotionEntity)
    private readonly appliedPromotions: Repository<InvoiceCheckoutPromotionEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(CustomerGroupEntity)
    private readonly customerGroups: Repository<CustomerGroupEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  /**
   * The invoice this drill-down is about.
   *
   * Invoice codes are unique per (organisation, branch) only — every branch
   * numbers its own invoices — so looking one up org-wide can return a
   * different branch's invoice with the same number. Callers that have the id
   * (the report rows do) send it; a code-only caller gets its own branch's
   * invoice first, falling back org-wide so a cross-branch document reference
   * still opens.
   */
  private async resolve(
    id: string | undefined,
    code: string | undefined,
    actor: GetInvoiceDetailQuery['actor'],
  ): Promise<InvoiceEntity | null> {
    const organizationId = actor.organizationId;
    if (id) {
      return this.invoices.findOne({ where: { id, organizationId } });
    }
    if (actor.branchId) {
      const own = await this.invoices.findOne({
        where: { code, organizationId, branchId: actor.branchId },
      });
      if (own) return own;
    }
    return this.invoices.findOne({ where: { code, organizationId } });
  }

  async execute({
    id,
    code,
    actor,
  }: GetInvoiceDetailQuery): Promise<InvoiceDetailView> {
    if (!id && !code) {
      throw new BadRequestException('id or code is required');
    }

    const invoice = await this.resolve(id, code, actor);
    if (!invoice) {
      throw new NotFoundException(`Invoice not found: ${id ?? code}`);
    }

    const [lines, payments, customer, cashier, applied] = await Promise.all([
      this.items.find({
        where: { invoiceId: invoice.id },
        order: { sortOrder: 'ASC' },
      }),
      this.payments.find({ where: { invoiceId: invoice.id } }),
      invoice.customerId
        ? this.customers.findOne({
            where: { id: invoice.customerId, organizationId: actor.organizationId },
          })
        : Promise.resolve(null),
      this.users.findOne({
        where: { id: invoice.staffId, organizationId: actor.organizationId },
      }),
      this.appliedPromotions.find({ where: { invoiceId: invoice.id } }),
    ]);

    // Each sold line's share of the item-level programmes. An invoice from
    // before the snapshot existed has none, so its whole promotion stays on the
    // bill — the safe reading when we cannot tell which kind it was.
    const itemPromotionByLine = new Map<string, number>();
    for (const program of applied) {
      if (!ITEM_LEVEL_PROGRAMS.has(program.type)) continue;
      for (const ld of program.lineDiscounts ?? []) {
        itemPromotionByLine.set(
          ld.lineId,
          (itemPromotionByLine.get(ld.lineId) ?? 0) + Number(ld.discountAmount ?? 0),
        );
      }
    }
    // What the line itself took off: the cashier's manual discount, plus on a
    // sold line its item-level programmes, on a returned line the part of the
    // original price the refund keeps back (`promotionDiscount`).
    const lineOwnDiscount = (l: InvoiceItemEntity): number =>
      Number(l.lineDiscount ?? 0) +
      (l.direction === ItemDirection.IN
        ? Number(l.promotionDiscount ?? 0)
        : itemPromotionByLine.get(l.id) ?? 0);

    const customerGroup =
      customer?.groupId != null
        ? (
            await this.customerGroups.findOne({
              where: {
                id: customer.groupId,
                organizationId: actor.organizationId,
              },
            })
          )?.name ?? null
        : null;

    // Same signing the reports use, so this dialog agrees with the "Bảng kê"
    // row it was opened from instead of restating a return as a positive sale.
    const headerSign = invoiceTypeSign(invoice.type);
    // Points and a deposit settle the bill the way a tender does (MISA lists
    // "Điểm thanh toán" under "Khách trả"), but `amountDue` has both already
    // taken off. Adding them back on both sides is what makes "Tổng thanh toán"
    // read as Tiền hàng − Khuyến mại + phí instead of a figure 65.000 short of
    // the lines, while "Công nợ" (the difference) stays exactly what it was.
    const settledOffTill =
      Number(invoice.pointsDiscountAmount ?? 0) + Number(invoice.depositAmount ?? 0);
    const tendered = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

    // A return (or an exchange that ends in a refund) owes nothing and collects
    // nothing — `amountDue` and `totalPaid` are 0 and the money goes back
    // through `refundedAmount`. Reading the header fields there showed
    // "Tiền hàng −385.000" over "Tổng thanh toán 0", so a refund is shown as
    // what it is: a bill of −refunded, settled by handing that much back.
    const refunded = Number(invoice.refundedAmount ?? 0);
    let totalAmount: number;
    let totalPaid: number;
    let debtCollected = 0;
    const tenders = payments.map((p) => ({
      method: p.paymentMethod as string,
      // Signed with the header: a refund is money leaving the drawer, and the
      // tender breakdown has to add up to the "Khách trả" above it.
      amount: signed(headerSign, p.amount),
    }));
    if (refunded > 0) {
      totalAmount = signed(-1, refunded);
      totalPaid = totalAmount;
      // `offsetAmount` is the part set against the customer's debt instead of
      // paid out; an OFFSET refund sets all of it.
      const offset =
        invoice.refundMethod === RefundMethod.OFFSET
          ? refunded
          : Number(invoice.offsetAmount ?? 0);
      const paidOut = refunded - offset;
      if (paidOut > 0) {
        tenders.push({ method: REFUND_TENDER[invoice.refundMethod ?? RefundMethod.CASH], amount: -paidOut });
      }
      if (offset > 0) tenders.push({ method: 'offset', amount: -offset });
    } else {
      totalAmount = signed(headerSign, Number(invoice.amountDue ?? 0) + settledOffTill);
      totalPaid = signed(headerSign, Number(invoice.totalPaid ?? 0) + settledOffTill);
      // A sale on credit collects the rest later; `totalPaid` grows with every
      // debt payment but no checkout tender records it.
      debtCollected = signed(headerSign, Number(invoice.totalPaid ?? 0) - tendered);
    }

    // The header `discountAmount` is manual + every programme + voucher
    // (persist-invoice). The item-level programmes now show on their lines, so
    // "Khuyến mại" under the table is the rest: bill-level programmes, voucher,
    // a manual discount on the whole bill.
    const soldLineItemPromotion = lines
      .filter((l) => l.direction !== ItemDirection.IN)
      .reduce((sum, l) => sum + (itemPromotionByLine.get(l.id) ?? 0), 0);

    return {
      code: invoice.code,
      issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
      status: invoice.status,
      type: invoice.type,
      cashier: cashier
        ? `${cashier.firstName} ${cashier.lastName}`.trim()
        : null,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      customerGroup,
      salesChannel: 'Tại cửa hàng',
      lines: lines.map((l) => {
        // IN = goods coming back from the customer. On an EXCHANGE both legs
        // sit on one invoice, so without a sign the returned pair and the
        // replacement look identical; negative is what tells them apart.
        const sign = l.direction === ItemDirection.IN ? -1 : 1;
        const quantity = signed(sign, l.quantity);
        // Unsigned: a rate, not an amount — returning goods does not make them
        // cost a negative price per unit.
        const unitPrice = Number(l.unitPrice ?? 0);
        const discount = lineOwnDiscount(l);
        return {
          sku: l.itemCode,
          name: l.itemName,
          unit: l.unit,
          quantity,
          unitPrice,
          lineAmount: signed(1, quantity * unitPrice),
          // Unsigned: "Tiền KM" is the size of the discount, and a discount
          // always moves the line TOWARDS zero — subtracted from a sale,
          // added back to a refund. Signing it here would make the row read
          // -750.000 minus -150.000, which nobody does in their head.
          discount: signed(1, discount),
          // `lineTotal` already has the manual discount off.
          lineTotal: signed(
            sign,
            Number(l.lineTotal ?? 0) - (discount - Number(l.lineDiscount ?? 0)),
          ),
          note: l.note ?? null,
        };
      }),
      // Σ of the signed line totals above: −subtotal for a RETURN, and the
      // exchange net (new − returned) for an EXCHANGE.
      subtotal: signed(
        1,
        lines.length
          ? lines.reduce(
              (sum, l) =>
                sum +
                (l.direction === ItemDirection.IN ? -1 : 1) *
                  (Number(l.lineTotal ?? 0) -
                    (lineOwnDiscount(l) - Number(l.lineDiscount ?? 0))),
              0,
            )
          : signedGoods(invoice),
      ),
      discountAmount: signed(
        headerSign,
        Number(invoice.discountAmount ?? 0) - soldLineItemPromotion,
      ),
      shippingFee: signed(headerSign, invoice.shippingFeeAmount),
      totalAmount,
      pointsAmount: signed(headerSign, invoice.pointsDiscountAmount),
      depositAmount: signed(headerSign, invoice.depositAmount),
      totalPaid,
      debt: signed(1, totalAmount - totalPaid),
      debtCollected,
      payments: tenders,
    };
  }
}
