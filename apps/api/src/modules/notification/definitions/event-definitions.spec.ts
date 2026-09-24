import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { NotificationRegistry } from '../core/definition/notification-registry.service';
import type { NotificationContext } from '../core/notification.types';
import { NOTIFICATION_DEFINITION_CLASSES } from './index';
import { InvoiceCancelNotificationDefinition } from './invoice-cancel.definition';
import { InvoiceReturnNotificationDefinition } from './invoice-return.definition';
import { PurchaseNotificationDefinition } from './purchase.definition';
import { StockInNotificationDefinition } from './stock-in.definition';
import { SalesOrderNotificationDefinition } from './sales-order.definition';
import { StockOutNotificationDefinition } from './stock-out.definition';

const lookup = {
  userName: jest.fn().mockResolvedValue('Nguyễn Văn A'),
  branchName: jest.fn().mockResolvedValue('Cửa hàng Q1'),
  invoiceAmounts: jest.fn(),
};

const ctx = <P>(payload: P): NotificationContext<P> => ({
  eventId: 'e-1',
  organizationId: 'o-1',
  branchId: 'b-1',
  actorId: 'u-1',
  occurredAt: new Date(),
  payload,
});

describe('event-driven notification definitions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('the whole catalogue registers cleanly — one topic may feed several types', () => {
    const registry = new NotificationRegistry(NOTIFICATION_DEFINITION_CLASSES.map((cls) => new cls(lookup as any)));

    expect(registry.typesForApp('erp_manager').sort()).toEqual(
      ['invoice', 'invoice_cancel', 'invoice_return', 'purchase', 'revenue', 'stock_alert', 'stock_in', 'stock_out'].sort(),
    );
    // `sales_order` là loại ĐẦU TIÊN của app bán hàng. Trước nó,
    // `typesForApp('erp_sales')` rỗng nên hộp thư của erp_sales luôn trống.
    expect(registry.typesForApp('erp_sales')).toEqual(['sales_order']);
    expect(registry.typesForApp('erp_manager')).not.toContain('sales_order');
    expect(registry.scheduled().map((d) => d.type).sort()).toEqual(['revenue', 'stock_alert']);
    expect(registry.byTopic(ERP_TOPICS.GOODS_RECEIPT_POSTED).map((d) => d.type).sort()).toEqual([
      'purchase',
      'stock_in',
    ]);
  });

  it('CHỈ `sales_order` loại trừ người thực hiện — mọi loại khác vẫn là quyết định 23/09/2026', () => {
    // Chốt chống việc một loại MỚI copy-paste từ file cũ rồi mang theo
    // `excludeActor: true`: nó compile sạch, chạy sạch, và chỉ lộ ra khi có
    // người ngồi hỏi "sao lập chứng từ mà máy mình không rung".
    //
    // `sales_order` là ngoại lệ DUY NHẤT và có khai báo (ADR-02): thu ngân giữ
    // CẢ `pos.sales-order.create` lẫn `pos.sales-order.approve`, nên người gửi
    // đơn nằm trong chính tập người nhận — khác hẳn 8 loại kia, nơi ca đó hiếm
    // và có nghĩa. Danh sách này ĐÓNG: thêm tên thứ hai vào đây phải kèm một ADR.
    const definitions = NOTIFICATION_DEFINITION_CLASSES.map((cls) => new cls(lookup as any));

    expect(definitions.filter((d) => d.excludeActor).map((d) => d.type)).toEqual(['sales_order']);
  });

  describe('sales_order — đơn tư vấn gửi cho thu ngân', () => {
    const definition = new SalesOrderNotificationDefinition(lookup as any);
    const payload = {
      salesOrderId: 'so-1',
      documentNumber: 'DT000003',
      totalAmount: 447500,
      actorId: 'u-1',
      channel: 'Ứng dụng Tư Vấn',
    };

    it('nghe đúng topic và chỉ tới app bán hàng', () => {
      expect(definition.trigger.topic).toBe(ERP_TOPICS.SALES_ORDER_SENT);
      expect(definition.targetApps).toEqual(['erp_sales']);
    });

    it('người nhận chọn theo quyền DUYỆT đơn, không theo vai', () => {
      // Đây là vế giữ tư vấn viên ở ngoài: `SALES_PERMISSION_KEYS` dừng ở
      // `read/create/cancel`, chỉ `CASHIER_PERMISSION_KEYS` mới có `approve`.
      expect(definition.permissions).toEqual(['pos.sales-order.approve']);
    });

    it('build ra data thô + target mở đúng đơn', async () => {
      expect(await definition.build(ctx(payload))).toEqual({
        data: { code: 'DT000003', amount: 447500, channel: 'Ứng dụng Tư Vấn', actor: 'Nguyễn Văn A' },
        target: { type: 'sales_order', id: 'so-1' },
      });
    });

    it('amount giữ dạng SỐ thô — app tự định dạng theo locale', async () => {
      const built = await definition.build(ctx({ ...payload, totalAmount: 1463000 }));
      expect(typeof built?.data.amount).toBe('number');
    });

    it('nhãn kênh lấy từ chứng từ, nên đơn đối tác mang nhãn của nó', async () => {
      const built = await definition.build(ctx({ ...payload, channel: 'Website công ty' }));
      expect(built?.data.channel).toBe('Website công ty');
    });

    it('payload hỏng thì BỎ QUA, không ném', async () => {
      await expect(definition.build(ctx({} as any))).resolves.toBeNull();
    });
  });

  describe('goods receipt → purchase XOR stock_in', () => {
    const purchase = new PurchaseNotificationDefinition(lookup as any);
    const stockIn = new StockInNotificationDefinition(lookup as any);
    const receipt = (purpose: string) => ({
      receiptId: 'gr-1',
      documentNumber: 'PNK001',
      purpose,
      totalAmount: 900000,
      lineCount: 2,
      postedAt: '2026-09-22T00:00:00Z',
      postedBy: 'u-9',
    });

    it.each([
      ['PURCHASE', true, false],
      ['OTHER', false, true],
      ['TRANSFER_IN', false, true],
    ])('purpose %s → purchase=%s stock_in=%s (never both)', (purpose, isPurchase, isStockIn) => {
      expect(purchase.shouldSend(ctx(receipt(purpose)))).toBe(isPurchase);
      expect(stockIn.shouldSend(ctx(receipt(purpose)))).toBe(isStockIn);
    });

    it('the actor is `postedBy`, not `actorId`', () => {
      expect(purchase.actorIdOf(receipt('PURCHASE'))).toBe('u-9');
      expect(stockIn.actorIdOf(receipt('OTHER'))).toBe('u-9');
    });

    it('targets the matching mobile stock slug with the branch', async () => {
      expect((await purchase.build(ctx(receipt('PURCHASE'))))?.target).toEqual({
        type: 'stock_document',
        id: 'gr-1',
        slug: 'goods-receipt',
        branchId: 'b-1',
      });
      expect((await stockIn.build(ctx(receipt('OTHER'))))?.target?.slug).toBe('stock-in');
    });
  });

  it('stock_out builds from GOODS_ISSUE_POSTED', async () => {
    const definition = new StockOutNotificationDefinition(lookup as any);
    const built = await definition.build(
      ctx({
        issueId: 'gi-1',
        documentNumber: 'XK001',
        purpose: 'OTHER',
        totalAmount: 3500,
        lineCount: 2,
        postedAt: '2026-09-22T00:00:00Z',
        postedBy: 'u-9',
      }),
    );

    expect(definition.trigger.topic).toBe(ERP_TOPICS.GOODS_ISSUE_POSTED);
    expect(built).toEqual({
      data: { code: 'XK001', amount: 3500, actor: 'Nguyễn Văn A', store: 'Cửa hàng Q1' },
      target: { type: 'stock_document', id: 'gi-1', slug: 'stock-out', branchId: 'b-1' },
    });
  });

  describe('invoice_return — amount read back from the invoice', () => {
    const definition = new InvoiceReturnNotificationDefinition(lookup as any);
    const payload = { returnInvoiceId: 'r-1', returnInvoiceCode: 'TH001', type: 'RETURN' };

    it('RETURN → refunded amount', async () => {
      lookup.invoiceAmounts.mockResolvedValue({ code: 'TH001', type: 'RETURN', amountDue: 0, refundedAmount: 120000, netAmount: 0 });
      expect((await definition.build(ctx(payload)))?.data.amount).toBe(120000);
    });

    it('EXCHANGE → |net|', async () => {
      lookup.invoiceAmounts.mockResolvedValue({ code: 'TH001', type: 'EXCHANGE', amountDue: 0, refundedAmount: 0, netAmount: -50000 });
      expect((await definition.build(ctx({ ...payload, type: 'EXCHANGE' })))?.data.amount).toBe(50000);
    });

    it('invoice gone → still notifies, just without an amount', async () => {
      lookup.invoiceAmounts.mockResolvedValue(null);
      const built = await definition.build(ctx(payload));
      expect(built?.data).toMatchObject({ code: 'TH001', amount: null });
      expect(built?.target).toEqual({ type: 'invoice', id: 'r-1' });
    });
  });

  it('invoice_cancel carries amountDue and opens the invoice', async () => {
    lookup.invoiceAmounts.mockResolvedValue({ code: 'HD9', type: 'SALE', amountDue: 777000, refundedAmount: 0, netAmount: 0 });
    const built = await new InvoiceCancelNotificationDefinition(lookup as any).build(
      ctx({ invoiceId: 'inv-9', documentNumber: 'HD9', reason: 'x' }),
    );
    expect(built).toEqual({
      data: { code: 'HD9', amount: 777000, actor: 'Nguyễn Văn A', store: 'Cửa hàng Q1' },
      target: { type: 'invoice', id: 'inv-9' },
    });
  });

  it('malformed payloads are skipped, not thrown', async () => {
    await expect(new StockOutNotificationDefinition(lookup as any).build(ctx({} as any))).resolves.toBeNull();
    await expect(new InvoiceCancelNotificationDefinition(lookup as any).build(ctx({} as any))).resolves.toBeNull();
    await expect(new PurchaseNotificationDefinition(lookup as any).build(ctx({} as any))).resolves.toBeNull();
  });
});
