import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InvoiceDetailView } from '@erp/shared-interfaces';
import { UserEntity } from '../../../auth/user.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { CustomerGroupEntity } from '../../../customer/customer-group.entity';
import { InvoiceEntity } from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { GetInvoiceDetailQuery } from './get-invoice-detail.query';

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

  async execute({
    code,
    actor,
  }: GetInvoiceDetailQuery): Promise<InvoiceDetailView> {
    if (!code) {
      throw new BadRequestException('code is required');
    }

    const invoice = await this.invoices.findOne({
      where: { code, organizationId: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice not found: ${code}`);
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

    const totalAmount = Number(invoice.amountDue ?? 0);
    const totalPaid = Number(invoice.totalPaid ?? 0);

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
        const quantity = Number(l.quantity ?? 0);
        const unitPrice = Number(l.unitPrice ?? 0);
        return {
          sku: l.itemCode,
          name: l.itemName,
          unit: l.unit,
          quantity,
          unitPrice,
          lineAmount: quantity * unitPrice,
          discount: Number(l.lineDiscount ?? 0),
          lineTotal: Number(l.lineTotal ?? 0),
          note: l.note ?? null,
        };
      }),
      subtotal: Number(invoice.subtotal ?? 0),
      totalAmount,
      totalPaid,
      debt: totalAmount - totalPaid,
      payments: payments.map((p) => ({
        method: p.paymentMethod,
        amount: Number(p.amount ?? 0),
      })),
    };
  }
}
