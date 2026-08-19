import { NotFoundException } from '@nestjs/common';
import { InvoiceType } from '../../../pos/entities/invoice.entity';
import { ItemDirection } from '../../../pos/entities/invoice-item.entity';
import { GetInvoiceDetailHandler } from './get-invoice-detail.handler';

const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

const line = (over: Record<string, any> = {}) => ({
  itemCode: 'SKU001',
  itemName: 'Giày',
  unit: 'đôi',
  direction: ItemDirection.OUT,
  quantity: 1,
  unitPrice: 750000,
  lineDiscount: 0,
  lineTotal: 750000,
  note: null,
  ...over,
});

function makeHandler(opts: {
  invoice?: any;
  lines?: any[];
  payments?: any[];
}) {
  const one = (row: any) => ({ findOne: jest.fn(async () => row ?? null) });
  const many = (rows?: any[]) => ({ find: jest.fn(async () => rows ?? []) });
  return new GetInvoiceDetailHandler(
    one(opts.invoice) as any,
    many(opts.lines) as any,
    many(opts.payments) as any,
    one(null) as any,
    one(null) as any,
    one(null) as any,
  );
}

const invoice = (over: Record<string, any> = {}) => ({
  id: 'i1',
  code: 'INV-001',
  organizationId: ORG,
  issuedAt: new Date('2026-08-14T05:15:00Z'),
  status: 'paid',
  type: InvoiceType.SALE,
  staffId: 's1',
  customerId: null,
  subtotal: 750000,
  amountDue: 750000,
  totalPaid: 750000,
  netAmount: 0,
  ...over,
});

describe('GetInvoiceDetailHandler', () => {
  it('throws when the invoice code does not exist', async () => {
    const handler = makeHandler({ invoice: null });
    await expect(
      handler.execute({ code: 'NOPE', actor } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leaves a plain sale positive', async () => {
    const handler = makeHandler({ invoice: invoice(), lines: [line()] });
    const detail = await handler.execute({ code: 'INV-001', actor } as any);
    expect(detail.lines[0]).toMatchObject({ quantity: 1, lineTotal: 750000 });
    expect(detail.subtotal).toBe(750000);
    expect(detail.totalAmount).toBe(750000);
  });

  // The reported case: on an exchange both legs sit on one invoice, and without
  // a sign there is no way to see which pair the customer handed back.
  it('shows the returned leg of an exchange negative and the new one positive', async () => {
    const handler = makeHandler({
      invoice: invoice({
        code: 'RTN-005',
        type: InvoiceType.EXCHANGE,
        subtotal: 720000,
        // newSubtotal 720k − returnSubtotal 750k
        netAmount: -30000,
      }),
      lines: [
        line({
          itemCode: 'ABA2777-D-38',
          direction: ItemDirection.IN,
          unitPrice: 750000,
          lineTotal: 750000,
        }),
        line({
          itemCode: 'ABA2950-D-38',
          direction: ItemDirection.OUT,
          unitPrice: 720000,
          lineTotal: 720000,
        }),
      ],
    });

    const detail = await handler.execute({ code: 'RTN-005', actor } as any);
    expect(detail.lines[0]).toMatchObject({
      sku: 'ABA2777-D-38',
      quantity: -1,
      lineAmount: -750000,
      lineTotal: -750000,
      // A rate: the pair does not cost minus 750k.
      unitPrice: 750000,
    });
    expect(detail.lines[1]).toMatchObject({
      sku: 'ABA2950-D-38',
      quantity: 1,
      lineTotal: 720000,
    });
    // "Tiền hàng" is the exchange net, i.e. Σ of the signed lines above it.
    expect(detail.subtotal).toBe(-30000);
    expect(detail.lines.reduce((s, l) => s + l.lineTotal, 0)).toBe(detail.subtotal);
  });

  // The promotion the original sale gave on the returned pair is money the
  // customer never paid, so it is not refunded — and taking it off here is what
  // makes the lines add up to the "Tiền hàng" printed under them.
  it('refunds a returned line net of the promotion carried from the original sale', async () => {
    const handler = makeHandler({
      invoice: invoice({
        code: 'RTN-022',
        type: InvoiceType.EXCHANGE,
        subtotal: 2400000,
        netAmount: 1800000,
      }),
      lines: [
        line({
          itemCode: 'ABA2777-D-39',
          direction: ItemDirection.IN,
          unitPrice: 750000,
          lineTotal: 750000,
          promotionDiscount: 150000,
        }),
        line({ itemCode: 'AK1163023-D-35', unitPrice: 1200000, lineTotal: 1200000 }),
        line({ itemCode: 'AK1163023-D-36', unitPrice: 1200000, lineTotal: 1200000 }),
      ],
    });

    const detail = await handler.execute({ code: 'RTN-022', actor } as any);
    expect(detail.lines[0]).toMatchObject({
      quantity: -1,
      // List price stays on the row; only the refunded value is netted.
      unitPrice: 750000,
      lineAmount: -750000,
      // A magnitude: -750.000 + 150.000 = -600.000.
      discount: 150000,
      lineTotal: -600000,
    });
    expect(detail.subtotal).toBe(1800000);
    expect(detail.lines.reduce((s, l) => s + l.lineTotal, 0)).toBe(detail.subtotal);
  });

  it('shows a return as money leaving the drawer', async () => {
    const handler = makeHandler({
      invoice: invoice({
        code: 'RTN-002',
        type: InvoiceType.RETURN,
        subtotal: 580000,
        amountDue: 580000,
        totalPaid: 580000,
      }),
      lines: [
        line({ itemCode: 'VI580', direction: ItemDirection.IN, unitPrice: 580000, lineTotal: 580000 }),
      ],
      payments: [{ paymentMethod: 'cash', amount: 580000 }],
    });

    const detail = await handler.execute({ code: 'RTN-002', actor } as any);
    expect(detail.lines[0]).toMatchObject({ quantity: -1, lineTotal: -580000 });
    expect(detail.subtotal).toBe(-580000);
    expect(detail.totalAmount).toBe(-580000);
    expect(detail.totalPaid).toBe(-580000);
    expect(detail.debt).toBe(0);
    // The tender breakdown has to add up to "Khách trả" above it.
    expect(detail.payments[0].amount).toBe(-580000);
  });
});
