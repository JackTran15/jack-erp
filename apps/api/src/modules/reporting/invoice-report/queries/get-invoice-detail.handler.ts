import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InvoiceDetailView } from '@erp/shared-interfaces';
import { UserEntity } from '../../../auth/user.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { CustomerGroupEntity } from '../../../customer/customer-group.entity';
import { InvoiceEntity } from '../../../pos/entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
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

    const [lines, payments, customer, cashier] = await Promise.all([
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
    ]);

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
    const totalAmount = signed(headerSign, invoice.amountDue);
    const totalPaid = signed(headerSign, invoice.totalPaid);

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
        // A returned line carries the promotion the original sale gave on it:
        // money the customer never paid, so it is not refunded either. Taking it
        // off here is what makes the lines add up to "Tiền hàng" below, which is
        // the exchange net the customer actually settled.
        const discount =
          Number(l.lineDiscount ?? 0) +
          (l.direction === ItemDirection.IN
            ? Number(l.promotionDiscount ?? 0)
            : 0);
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
          lineTotal: signed(
            sign,
            Number(l.lineTotal ?? 0) -
              (l.direction === ItemDirection.IN
                ? Number(l.promotionDiscount ?? 0)
                : 0),
          ),
          note: l.note ?? null,
        };
      }),
      // Σ of the signed line totals above: −subtotal for a RETURN, and the
      // exchange net (new − returned) for an EXCHANGE.
      subtotal: signed(1, signedGoods(invoice)),
      totalAmount,
      totalPaid,
      debt: signed(1, totalAmount - totalPaid),
      payments: payments.map((p) => ({
        method: p.paymentMethod,
        // Signed with the header: a refund is money leaving the drawer, and the
        // tender breakdown has to add up to the "Khách trả" above it.
        amount: signed(headerSign, p.amount),
      })),
    };
  }
}
