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
  applied?: any[];
}) {
  const one = (row: any) => ({ findOne: jest.fn(async () => row ?? null) });
  const many = (rows?: any[]) => ({ find: jest.fn(async () => rows ?? []) });
  return new GetInvoiceDetailHandler(
    one(opts.invoice) as any,
    many(opts.lines) as any,
    many(opts.payments) as any,
    many(opts.applied) as any,
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

  // Invoice codes restart per branch (uq_invoice_org_branch_code), so the
  // reported bug: the dialog opened another branch's invoice with the same
  // number. The id, when the row carries one, is what settles it.
  describe('which invoice it looks up', () => {
    const repo = (rows: any[]) => ({
      findOne: jest.fn(async ({ where }: any) => {
        const match = rows.find((r) =>
          Object.entries(where).every(([k, v]) => v === undefined || r[k] === v),
        );
        return match ?? null;
      }),
    });

    const own = invoice({ id: 'i-b1', code: 'DUP', branchId: 'b1', subtotal: 949000, amountDue: 949000 });
    const other = invoice({ id: 'i-b2', code: 'DUP', branchId: 'b2', subtotal: 850000, amountDue: 850000 });

    const handlerOver = (invoices: any) =>
      new GetInvoiceDetailHandler(
        invoices as any,
        { find: jest.fn(async () => []) } as any,
        { find: jest.fn(async () => []) } as any,
        { find: jest.fn(async () => []) } as any,
        { findOne: jest.fn(async () => null) } as any,
        { findOne: jest.fn(async () => null) } as any,
        { findOne: jest.fn(async () => null) } as any,
      );

    it('resolves by id, ignoring the code', async () => {
      // Rows ordered so a code-only lookup would hit the other branch first.
      const detail = await handlerOver(repo([other, own])).execute({
        id: 'i-b1',
        code: 'DUP',
        actor,
      } as any);
      expect(detail.totalAmount).toBe(949000);
    });

    it('prefers the actor branch when only a code is given', async () => {
      const detail = await handlerOver(repo([other, own])).execute({
        code: 'DUP',
        actor,
      } as any);
      expect(detail.totalAmount).toBe(949000);
    });

    it('falls back org-wide so a cross-branch reference still opens', async () => {
      const detail = await handlerOver(repo([other])).execute({
        code: 'DUP',
        actor,
      } as any);
      expect(detail.totalAmount).toBe(850000);
    });
  });

  it('leaves a plain sale positive', async () => {
    const handler = makeHandler({ invoice: invoice(), lines: [line()] });
    const detail = await handler.execute({ code: 'INV-001', actor } as any);
    expect(detail.lines[0]).toMatchObject({ quantity: 1, lineTotal: 750000 });
    expect(detail.subtotal).toBe(750000);
    expect(detail.totalAmount).toBe(750000);
  });

  // Prod 2608270006: 485.000 of goods, 65.000 of points, 420.000 in cash. The
  // dialog read "Tổng thanh toán 420.000" under lines worth 485.000.
  it('lists redeemed points as a tender instead of hiding them in the total', async () => {
    const handler = makeHandler({
      invoice: invoice({
        subtotal: 485000,
        pointsDiscountAmount: 65000,
        amountDue: 420000,
        totalPaid: 420000,
      }),
      lines: [line({ unitPrice: 485000, lineTotal: 485000 })],
      payments: [{ paymentMethod: 'cash', amount: 420000 }],
    });
    const detail = await handler.execute({ code: 'INV-001', actor } as any);

    expect(detail.subtotal).toBe(485000);
    expect(detail.totalAmount).toBe(485000);
    expect(detail.pointsAmount).toBe(65000);
    expect(detail.totalPaid).toBe(485000);
    expect(detail.payments).toEqual([{ method: 'cash', amount: 420000 }]);
    expect(detail.debt).toBe(0);
  });

  // KHO SG 2609210007: "Giảm giá 30%" is an INVOICE_DISCOUNT. The engine spreads
  // it over the lines, but it is a discount on the bill, so it stays there.
  it('keeps a bill-level programme on the invoice, not on the line', async () => {
    const handler = makeHandler({
      invoice: invoice({
        subtotal: 750000,
        discountAmount: 225000,
        pointsDiscountAmount: 10000,
        amountDue: 515000,
        totalPaid: 515000,
      }),
      lines: [line({ id: 'l1', unitPrice: 750000, lineTotal: 750000, promotionDiscount: 225000 })],
      payments: [{ paymentMethod: 'cash', amount: 515000 }],
      applied: [
        { type: 'INVOICE_DISCOUNT', lineDiscounts: [{ lineId: 'l1', discountAmount: 225000 }] },
      ],
    });
    const detail = await handler.execute({ code: 'INV-001', actor } as any);

    expect(detail.lines[0]).toMatchObject({ discount: 0, lineTotal: 750000 });
    expect(detail.subtotal).toBe(750000);
    expect(detail.discountAmount).toBe(225000);
    expect(detail.totalAmount).toBe(525000);
    expect(detail.pointsAmount).toBe(10000);
    expect(detail.totalPaid).toBe(525000);
    expect(detail.debt).toBe(0);
  });

  it('shows an item-level programme on the line it discounts', async () => {
    const handler = makeHandler({
      invoice: invoice({ subtotal: 1000000, discountAmount: 100000, amountDue: 900000, totalPaid: 900000 }),
      lines: [
        line({ id: 'l1', unitPrice: 600000, lineTotal: 600000, promotionDiscount: 100000 }),
        line({ id: 'l2', unitPrice: 400000, lineTotal: 400000 }),
      ],
      payments: [{ paymentMethod: 'cash', amount: 900000 }],
      applied: [
        { type: 'ITEM_DISCOUNT', lineDiscounts: [{ lineId: 'l1', discountAmount: 100000 }] },
      ],
    });
    const detail = await handler.execute({ code: 'INV-001', actor } as any);

    expect(detail.lines[0]).toMatchObject({ discount: 100000, lineTotal: 500000 });
    expect(detail.lines[1]).toMatchObject({ discount: 0, lineTotal: 400000 });
    expect(detail.subtotal).toBe(900000);
    expect(detail.discountAmount).toBe(0);
    expect(detail.totalAmount).toBe(900000);
  });

  it('shows the header promotion and keeps an unpaid balance as debt', async () => {
    const handler = makeHandler({
      invoice: invoice({
        subtotal: 1000000,
        discountAmount: 200000,
        depositAmount: 100000,
        amountDue: 700000,
        totalPaid: 500000,
      }),
      lines: [line({ unitPrice: 1000000, lineTotal: 1000000 })],
      payments: [{ paymentMethod: 'cash', amount: 500000 }],
    });
    const detail = await handler.execute({ code: 'INV-001', actor } as any);

    // 1.000.000 − 200.000 = 800.000; settled by 100.000 deposit + 500.000 cash.
    expect(detail.discountAmount).toBe(200000);
    expect(detail.totalAmount).toBe(800000);
    expect(detail.depositAmount).toBe(100000);
    expect(detail.totalPaid).toBe(600000);
    expect(detail.debt).toBe(200000);
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
