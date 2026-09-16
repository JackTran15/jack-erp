import { SessionStatus } from '@erp/shared-interfaces';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileCashierService } from './mobile-cashier.service';

describe('MobileCashierService', () => {
  const actor: ActorContext = { userId: 'u-1', organizationId: 'org-1', branchId: 'br-1', roles: [] };

  function build(sessions: Array<Record<string, unknown>>, options: { withinThreshold?: boolean; checkedOut?: boolean; partial?: boolean; invoiceChannel?: string | null; netAmount?: number; originalDebt?: number } = {}) {
    const repo = { find: jest.fn(async () => sessions), findOne: jest.fn(async () => sessions.find((s) => s.status === SessionStatus.CLOSING) ?? null) };
    const cashRepo = { find: jest.fn(async () => [{ id: 'ca-1', name: 'Quỹ tiền mặt - KHO SG' }]) };
    const posSessions = {
      openSession: jest.fn(async () => ({ id: 'ses-new' })),
      startSales: jest.fn(async () => undefined),
      startClose: jest.fn(async () => ({ session: {}, expectedCash: 1155000 })),
      reopen: jest.fn(async () => undefined),
      submitReconciliation: jest.fn(async () => ({ varianceApproved: options.withinThreshold ?? true, variance: options.withinThreshold === false ? -50000 : 0 })),
      finalizeClose: jest.fn(async () => undefined),
      expectedCashOf: jest.fn(async () => 1155000),
      findOpenForBranch: jest.fn(async () => ({ id: 'ses-1', cashAccountId: 'ca-1' })),
    };
    const draftInvoice = {
      id: 'inv-1',
      code: 'DRAFT-1',
      isDraft: options.checkedOut !== true,
      salesOrderId: 'so-1',
      salespersonId: 'profile-1',
      salesChannel: options.invoiceChannel ?? null,
      note: null,
      subtotal: '1500000.00',
      discountAmount: '100000.00',
      // Nháp đã đổi điểm: cột `numeric` của pg về dưới dạng CHUỖI, nên đây là
      // chỗ duy nhất phân biệt được "trả nguyên xi" với "đã ép về số".
      pointsRedeemed: 2,
      pointsDiscountAmount: '1000.00',
      amountDue: '1399000.00',
      customer: { id: 'c-1', name: 'Nguyễn Văn A', phone: '0900000001' },
      items: [
        { sortOrder: 1, itemId: 'i-2', itemCode: 'B', itemName: 'Hàng B', unit: 'cái', quantity: '1', unitPrice: '500000', lineDiscount: '0', promotionDiscount: '0', lineTotal: '500000' },
        { sortOrder: 0, itemId: 'i-1', itemCode: 'A', itemName: 'Hàng A', unit: 'cái', quantity: '2', unitPrice: '500000', lineDiscount: '50000', promotionDiscount: '50000', lineTotal: '900000' },
      ],
      payments: [],
    };
    const invoices = {
      findOne: jest.fn(async () => draftInvoice),
      findOneWithItems: jest.fn(async () => draftInvoice),
      update: jest.fn(async () => draftInvoice),
    };
    const profiles = { findOne: jest.fn(async () => ({ user: { firstName: 'Trần', lastName: 'Lộc' } })) };
    const salesOrders = {
      findOne: jest.fn(async () => ({ id: 'so-1', documentNumber: 'DT000015', salesChannel: 'ONLINE' })),
      update: jest.fn(async () => undefined),
    };
    const invoiceRepoUpdate = jest.fn(async () => undefined);
    const dataSource = {
      query: jest.fn(async () => [{ total: '250000' }]),
      getRepository: jest.fn(() => ({ update: invoiceRepoUpdate, find: jest.fn(async () => [{ id: 'it-1', productId: 'm-1' }]) })),
    };
    const checkoutService = {
      checkout: jest.fn(async () => ({
        id: 'inv-1',
        code: 'HD00012',
        status: options.partial ? 'partial_debt' : 'paid',
        amountDue: '1400000.00',
        totalPaid: options.partial ? '1000000.00' : '1400000.00',
        salesOrderId: 'so-1',
      })),
    };
    const paymentRows = [
      { id: 'pa-1', label: 'VCB 0011', paymentMethod: 'bank_transfer', branchId: null, sortOrder: 1 },
      { id: 'pa-2', label: null, paymentMethod: 'card', branchId: 'br-1', sortOrder: 2 },
    ];
    const qb = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      getMany: jest.fn(async () => paymentRows),
    };
    for (const key of ['where', 'andWhere', 'orderBy', 'addOrderBy'] as const) (qb[key] as jest.Mock).mockReturnValue(qb);
    const paymentAccountRepo = { createQueryBuilder: jest.fn(() => qb) };
    const partnerLookup = {
      customersWithDebt: jest.fn(async () => ({
        data: [
          { customerId: 'c-1', customerName: 'Nguyễn Văn A', customerCode: 'KH001', customerPhone: '0900000001', debtCount: 2, totalOriginal: 900000, totalRemaining: 350000, earliestDueDate: null, hasOverdue: false },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      })),
    };
    const cashDebtCollection = { collect: jest.fn(async () => ({ receiptId: 'rc-1', documentNumber: 'PT00007', totalAmount: 350000 })) };
    const bankDebtCollection = { collect: jest.fn(async () => ({ receiptId: 'rb-1', documentNumber: 'BT00003', totalAmount: 100000 })) };
    (paymentAccountRepo as { findOne?: jest.Mock }).findOne = jest.fn(async ({ where }: { where: { id: string } }) =>
      where.id === 'pa-bank' ? { id: 'pa-bank', depositAccountId: 'dep-1' } : where.id === 'pa-nodep' ? { id: 'pa-nodep', depositAccountId: null } : null,
    );
    const queryBus = {
      execute: jest.fn(async () => ({
        data: [{ id: 'inv-9', code: '2609140003', createdAt: '2026-09-14T08:36:00Z', amountDue: '750000', totalPaid: '750000', customer: { name: 'A TRẦN', phone: '0947' }, items: [{}] }],
        total: 1,
        page: 1,
        limit: 20,
      })),
    };
    const eligibleLines = [
      { originalInvoiceItemId: 'it-1', itemId: 'i-1', itemCode: 'A', itemName: 'Giày A', unit: 'Đôi', unitPrice: 750000, refundableUnitPrice: 700000, lineDiscount: 50000, locationId: 'loc-1', soldQuantity: 2, returnedQuantity: 0, maxReturnable: 2 },
      { originalInvoiceItemId: 'it-2', itemId: 'i-2', itemCode: 'B', itemName: 'Ba lô B', unit: 'Cái', unitPrice: 650000, refundableUnitPrice: 650000, lineDiscount: 0, locationId: undefined, soldQuantity: 1, returnedQuantity: 1, maxReturnable: 0 },
    ];
    const returnEligibility = {
      getEligibleLines: jest.fn(async () => eligibleLines),
      getOutstandingDebt: jest.fn(async () => ({ remainingDebt: options.originalDebt ?? 0 })),
    };
    const createReturn = { create: jest.fn(async () => ({ id: 'ret-1' })) };
    const createExchange = { create: jest.fn(async () => ({ id: 'exc-1' })) };
    const checkoutReturn = {
      checkout: jest.fn(async () => ({
        id: 'ret-1',
        code: 'TH00004',
        status: 'paid',
        netAmount: options.netAmount ?? -700000,
        refundedAmount: 700000,
        offsetAmount: options.originalDebt ?? 0,
        totalPaid: options.netAmount && options.netAmount > 0 ? options.netAmount : 0,
      })),
    };
    const service = new MobileCashierService(
      repo as never,
      cashRepo as never,
      posSessions as never,
      invoices as never,
      profiles as never,
      salesOrders as never,
      dataSource as never,
      checkoutService as never,
      paymentAccountRepo as never,
      partnerLookup as never,
      cashDebtCollection as never,
      bankDebtCollection as never,
      queryBus as never,
      returnEligibility as never,
      createReturn as never,
      createExchange as never,
      checkoutReturn as never,
    );
    return {
      service, repo, cashRepo, posSessions, invoices, salesOrders, dataSource, invoiceRepoUpdate, checkoutService, qb,
      partnerLookup, cashDebtCollection, bankDebtCollection, queryBus, returnEligibility, createReturn, createExchange, checkoutReturn,
    };
  }

  it('không có phiên → open:false, session null', async () => {
    const { service, repo } = build([]);
    await expect(service.session(actor)).resolves.toEqual({ open: false, session: null });
    // Chỉ tra phiên OPEN/ACTIVE_SALES của đúng chi nhánh trong header.
    const where = (repo.find.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ organizationId: 'org-1', branchId: 'br-1' });
  });

  it('ưu tiên phiên do CHÍNH người gọi mở, dù phiên khác mở sau', async () => {
    const { service } = build([
      { id: 'ses-newer', status: SessionStatus.ACTIVE_SALES, openedBy: 'u-9', openedAt: new Date('2026-09-14T03:00:00Z'), openingCashAmount: '0' },
      { id: 'ses-mine', status: SessionStatus.ACTIVE_SALES, openedBy: 'u-1', openedAt: new Date('2026-09-14T01:00:00Z'), openingCashAmount: '500000.00' },
    ]);
    const view = await service.session(actor);
    expect(view.open).toBe(true);
    expect(view.session).toMatchObject({ id: 'ses-mine', openingCashAmount: 500000 });
  });

  it('không có phiên của mình thì lấy phiên mới nhất của chi nhánh; số về number', async () => {
    const { service } = build([
      { id: 'ses-a', status: SessionStatus.OPEN, openedBy: 'u-9', openedAt: new Date(), openingCashAmount: '120000.00', cashAccountId: 'ca-1' },
    ]);
    const view = await service.session(actor);
    expect(view.session).toMatchObject({ id: 'ses-a', cashAccountId: 'ca-1', openingCashAmount: 120000 });
    expect(typeof view.session?.openingCashAmount).toBe('number');
  });

  it('openShift = open + start-sales trong một lượt, két của chi nhánh trong header', async () => {
    const { service, posSessions } = build([]);
    await service.openShift({ cashAccountId: 'ca-1', openingCashAmount: 0 }, actor);
    expect(posSessions.openSession).toHaveBeenCalledWith({ branchId: 'br-1', cashAccountId: 'ca-1', openingCashAmount: 0 }, actor);
    expect(posSessions.startSales).toHaveBeenCalledWith('ses-new', actor);
  });

  it('startClose khi chưa có ca → 409 NO_OPEN_SESSION; có ca → chuyển CLOSING', async () => {
    await expect(build([]).service.startClose(actor)).rejects.toMatchObject({ response: { code: 'NO_OPEN_SESSION' } });
    const { service, posSessions } = build([{ id: 'ses-1', status: SessionStatus.ACTIVE_SALES, openedBy: 'u-1', openedAt: new Date(), openingCashAmount: '0' }]);
    await service.startClose(actor);
    expect(posSessions.startClose).toHaveBeenCalledWith('ses-1', actor);
  });

  it('session đang CLOSING mang expectedCash (Tiền thu trong ca) — màn Đóng ca đọc từ đây', async () => {
    const { service } = build([{ id: 'ses-1', status: SessionStatus.CLOSING, openedBy: 'u-1', openedAt: new Date(), openingCashAmount: '0' }]);
    const view = await service.session(actor);
    expect(view.session).toMatchObject({ status: SessionStatus.CLOSING, expectedCash: 1155000 });
  });

  it('reopen (HỦY BỎ màn Đóng ca) gọi PosSessionService.reopen trên phiên CLOSING của chi nhánh', async () => {
    const { service, posSessions } = build([{ id: 'ses-1', status: SessionStatus.CLOSING, openedBy: 'u-1', openedAt: new Date(), openingCashAmount: '0' }]);
    await service.reopen(actor);
    expect(posSessions.reopen).toHaveBeenCalledWith('ses-1', actor);
  });

  it('closeShift: khớp tiền → kiểm kê + đóng; lệch → 409 VARIANCE_NEEDS_APPROVAL, KHÔNG đóng', async () => {
    const ok = build([{ id: 'ses-1', status: SessionStatus.CLOSING, openedBy: 'u-1', openedAt: new Date(), openingCashAmount: '0' }]);
    await expect(ok.service.closeShift({ actualCash: 1155000 }, actor)).resolves.toEqual({ closed: true, variance: 0 });
    expect(ok.posSessions.finalizeClose).toHaveBeenCalledWith('ses-1', actor);

    const bad = build([{ id: 'ses-1', status: SessionStatus.CLOSING, openedBy: 'u-1', openedAt: new Date(), openingCashAmount: '0' }], { withinThreshold: false });
    await expect(bad.service.closeShift({ actualCash: 1105000 }, actor)).rejects.toMatchObject({ response: { code: 'VARIANCE_NEEDS_APPROVAL', variance: -50000 } });
    expect(bad.posSessions.finalizeClose).not.toHaveBeenCalled();
  });
  describe('hoá đơn nháp → giỏ (T-15-01)', () => {
    it('trả đúng hình dạng giỏ: dòng theo sortOrder, giảm dòng = tay + KM, công nợ khách, kênh từ đơn', async () => {
      const { service, dataSource } = build([]);
      const view = await service.draft('inv-1', actor);
      expect(view).toMatchObject({
        invoiceId: 'inv-1',
        invoiceCode: 'DRAFT-1',
        salesOrderCode: 'DT000015',
        salesChannel: 'ONLINE',
        customer: { id: 'c-1', name: 'Nguyễn Văn A', phone: '0900000001', outstandingDebt: 250000 },
        salesperson: { id: 'profile-1', name: 'Trần Lộc' },
        subtotal: 1500000,
        discount: 100000,
        amountDue: 1399000,
      });
      expect(view.lines.map((l) => l.itemCode)).toEqual(['A', 'B']);
      expect(view.lines[0]).toMatchObject({ quantity: 2, unitPrice: 500000, lineDiscount: 100000, lineTotal: 900000 });
      // Công nợ tra đúng khách, đúng tổ chức, chỉ khoản CHƯA TRẢ — enum `debt_status_enum` là chữ THƯỜNG (đo: 'OPEN' → 500).
      expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining("status IN ('open', 'overdue')"), ['org-1', 'c-1']);
    });

    it('mang theo điểm ĐÃ TRỪ trên nháp — giỏ nạp lại không được bày số tiền chưa trừ', async () => {
      // Ca thật, đo 2026-09-15: *Nhận xử lý* trừ điểm trong cùng transaction
      // (`amount_due` 524.000), rồi app nạp giỏ bằng đúng đường này và bày
      // 525.000 vì view không mang hai trường dưới. Điểm đã trừ thật, màn hình
      // thì nói chưa — kiểu sai tệ nhất, vì nó hiện ra ở bước THU TIỀN.
      const { service } = build([]);
      const view = await service.draft('inv-1', actor);
      expect(view).toMatchObject({ pointsRedeemed: 2, pointsDiscountAmount: 1000 });
    });

    it('đã checkout → 400, không sửa', async () => {
      const { service, invoices } = build([], { checkedOut: true });
      await expect(service.draft('inv-1', actor)).rejects.toThrow('không còn là nháp');
      await expect(service.updateDraft('inv-1', { note: 'x' }, actor)).rejects.toThrow('không sửa được');
      expect(invoices.update).not.toHaveBeenCalled();
    });

    it('PATCH: dòng → items có sortOrder; kênh bán ghi cột hoá đơn; trả lại view mới', async () => {
      const { service, invoices, invoiceRepoUpdate } = build([]);
      const view = await service.updateDraft(
        'inv-1',
        {
          customerId: 'c-2',
          salesChannel: 'STORE',
          lines: [
            { itemId: 'i-1', itemCode: 'A', itemName: 'Hàng A', unit: 'cái', quantity: 3, unitPrice: 500000, lineDiscount: 0 },
            { itemId: 'i-2', itemCode: 'B', itemName: 'Hàng B', unit: 'cái', quantity: 1, unitPrice: 500000 },
          ],
        },
        actor,
      );
      const [, dto] = invoices.update.mock.calls[0] as unknown as [string, { customerId: string; items: Array<{ sortOrder: number; itemId: string }> }];
      expect(dto.customerId).toBe('c-2');
      expect(dto.items.map((i) => [i.itemId, i.sortOrder])).toEqual([['i-1', 0], ['i-2', 1]]);
      expect(invoiceRepoUpdate).toHaveBeenCalledWith({ id: 'inv-1', organizationId: 'org-1' }, { salesChannel: 'STORE' });
      expect(view.invoiceId).toBe('inv-1');
    });
  });
  describe('thu tiền hoá đơn nháp + tài khoản nhận (T-16-01)', () => {
    it('kênh trên HOÁ ĐƠN thắng kênh trên đơn khi đọc giỏ', async () => {
      const { service } = build([], { invoiceChannel: 'STORE' });
      await expect(service.draft('inv-1', actor)).resolves.toMatchObject({ salesChannel: 'STORE' });
    });

    it('thu đủ: đi qua CheckoutInvoiceService với `paymentMethod`, trả số hoá đơn + paid, remainder 0', async () => {
      const { service, checkoutService } = build([]);
      const result = await service.checkout(
        'inv-1',
        { payments: [{ method: 'cash' as never, amount: 1000000 }, { method: 'bank_transfer' as never, amount: 400000, paymentAccountId: 'pa-1' }] },
        actor,
      );
      const [id, dto] = checkoutService.checkout.mock.calls[0] as unknown as [string, { payments: Array<Record<string, unknown>> }];
      expect(id).toBe('inv-1');
      expect(dto.payments).toEqual([
        { paymentMethod: 'cash', amount: 1000000, paymentAccountId: undefined },
        { paymentMethod: 'bank_transfer', amount: 400000, paymentAccountId: 'pa-1' },
      ]);
      expect(result).toMatchObject({ invoiceCode: 'HD00012', status: 'paid', amountDue: 1400000, totalPaid: 1400000, remainder: 0 });
    });

    it('thu thiếu có khách: phần còn là remainder, trạng thái partial_debt do POS quyết', async () => {
      const { service } = build([], { partial: true });
      const result = await service.checkout('inv-1', { payments: [{ method: 'cash' as never, amount: 1000000 }] }, actor);
      expect(result).toMatchObject({ status: 'partial_debt', remainder: 400000 });
    });

    it('kênh bán gửi kèm được ghi TRƯỚC khi checkout; đã checkout rồi → 400, không gọi POS', async () => {
      const { service, invoiceRepoUpdate, checkoutService } = build([]);
      await service.checkout('inv-1', { payments: [], salesChannel: 'ONLINE' }, actor);
      expect(invoiceRepoUpdate.mock.invocationCallOrder[0]).toBeLessThan(checkoutService.checkout.mock.invocationCallOrder[0]);
      expect(invoiceRepoUpdate).toHaveBeenCalledWith({ id: 'inv-1', organizationId: 'org-1' }, { salesChannel: 'ONLINE' });

      const done = build([], { checkedOut: true });
      await expect(done.service.checkout('inv-1', { payments: [] }, actor)).rejects.toThrow('đã thu tiền');
      expect(done.checkoutService.checkout).not.toHaveBeenCalled();
    });

    it('tài khoản nhận: đúng tổ chức, đang hoạt động, của chi nhánh hoặc dùng chung; nhãn rơi về phương thức', async () => {
      const { service, qb } = build([]);
      const rows = await service.paymentAccounts(actor);
      expect(qb.where).toHaveBeenCalledWith('pa.organizationId = :org', { org: 'org-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('(pa.branchId IS NULL OR pa.branchId = :branch)', { branch: 'br-1' });
      expect(rows).toEqual([
        { id: 'pa-1', label: 'VCB 0011', paymentMethod: 'bank_transfer', branchId: null },
        { id: 'pa-2', label: 'card', paymentMethod: 'card', branchId: 'br-1' },
      ]);
    });
  });
  describe('thu nợ (T-17-01)', () => {
    it('danh sách khách nợ: chuyển tìm/sắp xếp/trang xuống lookup của web, trả SĐT + tổng nợ', async () => {
      const { service, partnerLookup } = build([]);
      const result = await service.debtors({ search: '0900', sort: 'debtDesc' as never, page: 2, pageSize: 20 }, actor);
      expect(partnerLookup.customersWithDebt).toHaveBeenCalledWith({ search: '0900', sort: 'debtDesc', page: 2, pageSize: 20 }, actor);
      expect(result.data[0]).toMatchObject({ customerId: 'c-1', name: 'Nguyễn Văn A', phone: '0900000001', totalRemaining: 350000, debtCount: 2 });
      expect(result.total).toBe(1);
    });

    it('khoản nợ của một khách: chỉ open/overdue, số hoá đơn từ `invoices.code`, tổng còn lại', async () => {
      const { service, dataSource } = build([]);
      (dataSource.query as jest.Mock).mockResolvedValueOnce([
        { id: 'd-1', invoice_id: 'inv-1', invoice_code: '2609140002', reference_code: 'DEBT-1', original_amount: '750000', paid_amount: '650000', remaining_amount: '100000', issued_at: '2026-09-14', due_date: null, status: 'open' },
        { id: 'd-2', invoice_id: 'inv-2', invoice_code: null, reference_code: 'DEBT-2', original_amount: '250000', paid_amount: '0', remaining_amount: '250000', issued_at: '2026-09-01', due_date: '2026-09-10', status: 'overdue' },
      ]);
      const result = await service.debtsOf('c-1', actor);
      expect((dataSource.query as jest.Mock).mock.calls[0][0]).toContain("d.status IN ('open', 'overdue')");
      expect(result.data.map((d) => [d.invoiceCode, d.remainingAmount, d.overdue])).toEqual([['2609140002', 100000, false], ['DEBT-2', 250000, true]]);
      expect(result.totalRemaining).toBe(350000);
    });

    it('tiền mặt: đi saga phiếu thu với két của CA ĐANG MỞ, đối tượng CUSTOMER, cùng idempotency key', async () => {
      const { service, cashDebtCollection, posSessions } = build([]);
      const result = await service.collectDebt(
        { customerId: 'c-1', paymentMethod: 'cash' as never, note: 'thu tại quầy', allocations: [{ invoiceDebtId: 'd-1', amount: 100000 }, { invoiceDebtId: 'd-2', amount: 250000 }] },
        'idem-1',
        actor,
      );
      expect(posSessions.findOpenForBranch).toHaveBeenCalledWith('br-1', actor);
      const [dto, key] = cashDebtCollection.collect.mock.calls[0] as unknown as [Record<string, unknown>, string];
      expect(dto).toMatchObject({ partnerType: 'CUSTOMER', partnerId: 'c-1', cashAccountId: 'ca-1', reason: 'thu tại quầy' });
      expect(dto.allocations).toEqual([{ invoiceDebtId: 'd-1', amount: 100000 }, { invoiceDebtId: 'd-2', amount: 250000 }]);
      expect(key).toBe('idem-1');
      expect(result).toEqual({ receiptId: 'rc-1', code: 'PT00007', total: 350000, paymentMethod: 'cash' });
    });

    it('tiền mặt mà chưa mở ca → lỗi của findOpenForBranch nổi lên nguyên (NO_OPEN_SESSION), không gọi saga', async () => {
      const { service, cashDebtCollection, posSessions } = build([]);
      (posSessions.findOpenForBranch as jest.Mock).mockRejectedValueOnce(new Error('NO_OPEN_SESSION'));
      await expect(service.collectDebt({ customerId: 'c-1', paymentMethod: 'cash' as never, allocations: [{ invoiceDebtId: 'd-1', amount: 1 }] }, 'k', actor)).rejects.toThrow('NO_OPEN_SESSION');
      expect(cashDebtCollection.collect).not.toHaveBeenCalled();
    });

    it('chuyển khoản: tài khoản nhận → deposit account của nó, đi saga phiếu thu ngân hàng', async () => {
      const { service, bankDebtCollection } = build([]);
      const result = await service.collectDebt(
        { customerId: 'c-1', paymentMethod: 'bank_transfer' as never, paymentAccountId: 'pa-bank', allocations: [{ invoiceDebtId: 'd-1', amount: 100000 }] },
        'idem-2',
        actor,
      );
      const [dto, key] = bankDebtCollection.collect.mock.calls[0] as unknown as [Record<string, unknown>, string];
      expect(dto).toMatchObject({ depositAccountId: 'dep-1', partnerType: 'CUSTOMER', partnerId: 'c-1' });
      expect(key).toBe('idem-2');
      expect(result).toMatchObject({ code: 'BT00003', total: 100000, paymentMethod: 'bank_transfer' });
    });

    it('chuyển khoản thiếu tài khoản nhận, hoặc tài khoản không gắn deposit account → 400, không gọi saga', async () => {
      const { service, bankDebtCollection } = build([]);
      const base = { customerId: 'c-1', paymentMethod: 'bank_transfer' as never, allocations: [{ invoiceDebtId: 'd-1', amount: 1 }] };
      await expect(service.collectDebt(base, 'k', actor)).rejects.toThrow('tài khoản nhận');
      await expect(service.collectDebt({ ...base, paymentAccountId: 'pa-nodep' }, 'k', actor)).rejects.toThrow('deposit account');
      expect(bankDebtCollection.collect).not.toHaveBeenCalled();
    });
  });
  describe('giỏ thu ngân tự dựng → hoá đơn nháp (Loc rà 2026-09-14)', () => {
    it('cần ca đang mở; lập nháp trong giao dịch với dòng giỏ, ghi kênh bán, trả hình dạng draft()', async () => {
      const { service, invoices, posSessions, dataSource } = build([{ id: 'ses-1', status: 'ACTIVE_SALES' }]);
      const createDraftIn = jest.fn(async () => ({ id: 'inv-1' }));
      (invoices as Record<string, unknown>).createDraftIn = createDraftIn;
      const manager = { update: jest.fn(async () => undefined) };
      (dataSource as Record<string, unknown>).transaction = jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager));

      const view = await service.createDraft(
        {
          customerId: 'c-1',
          salesChannel: 'Shopee',
          lines: [{ itemId: 'it-1', itemCode: 'ABA2777-D-38', itemName: 'Giày nam', unit: 'Đôi', quantity: 1, unitPrice: 750000 }],
        },
        actor,
      );

      expect(posSessions.findOpenForBranch).toHaveBeenCalled();
      const dto = (createDraftIn.mock.calls[0] as unknown as [unknown, { sessionId: string; customerId?: string; items: Array<{ itemId: string; sortOrder: number }> }])[1];
      expect(dto.sessionId).toBe('ses-1');
      expect(dto.customerId).toBe('c-1');
      expect(dto.items[0]).toMatchObject({ itemId: 'it-1', sortOrder: 0 });
      expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'inv-1', { salesChannel: 'Shopee' });
      expect(view.invoiceId).toBe('inv-1');
    });
  });

  describe('đổi trả (T-18-01)', () => {
    it('danh sách đủ điều kiện: kỳ → createdAt; ô tìm rẽ SĐT / số HĐ / tên; hàng gọn cho app', async () => {
      const { service, queryBus } = build([]);
      const result = await service.returnableInvoices({ from: '2026-09-01', to: '2026-09-14', search: '0947141742', page: 1, limit: 20 }, actor);
      const dtoPhone = (queryBus.execute.mock.calls[0] as unknown as [{ dto: Record<string, unknown> }])[0].dto;
      expect(dtoPhone).toMatchObject({ page: 1, limit: 20, createdAt: { from: '2026-09-01', to: '2026-09-14' }, customerPhone: { operator: '*', value: '0947141742' } });
      await service.returnableInvoices({ search: '260914' }, actor);
      expect((queryBus.execute.mock.calls[1] as unknown as [{ dto: Record<string, unknown> }])[0].dto).toMatchObject({ code: { operator: '*', value: '260914' } });
      await service.returnableInvoices({ search: 'A Trần' }, actor);
      expect((queryBus.execute.mock.calls[2] as unknown as [{ dto: Record<string, unknown> }])[0].dto).toMatchObject({ customerName: { operator: '*', value: 'A Trần' } });
      expect(result.data[0]).toMatchObject({ code: '2609140003', customerName: 'A TRẦN', customerPhone: '0947', amountDue: 750000, itemCount: 1 });
    });

    it('chi tiết: dòng gốc kèm allowedQty (maxReturnable) và nợ còn trên HĐ gốc', async () => {
      const { service } = build([], { originalDebt: 100000 });
      const detail = await service.returnableDetail('inv-1', actor);
      expect(detail.lines.map((l) => [l.itemCode, l.allowedQty, l.refundableUnitPrice])).toEqual([['A', 2, 700000], ['B', 0, 650000]]);
      expect(detail.outstandingDebt).toBe(100000);
    });

    it('trả THUẦN: `returns` (REGULAR, két của ca, kho của dòng gốc, giá hoàn) rồi checkout-return CASH → refund âm', async () => {
      const { service, createReturn, createExchange, checkoutReturn } = build([]);
      const result = await service.exchange(
        { originalInvoiceId: 'inv-1', returnLines: [{ originalInvoiceItemId: 'it-1', quantity: 1 }], refundMethod: 'cash' as never },
        actor,
      );
      expect(createExchange.create).not.toHaveBeenCalled();
      const [dto] = createReturn.create.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(dto).toMatchObject({ mode: 'regular', originalInvoiceId: 'inv-1', sessionId: 'ses-1', reason: 'Đổi trả tại quầy' });
      expect((dto.lines as Array<Record<string, unknown>>)[0]).toMatchObject({ originalInvoiceItemId: 'it-1', locationId: 'loc-1', quantity: 1, unitPrice: 700000 });
      const [id, checkoutDto] = checkoutReturn.checkout.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(id).toBe('ret-1');
      expect(checkoutDto).toMatchObject({ refundMethod: 'CASH', cashAccountId: 'ca-1' });
      expect(result).toMatchObject({ code: 'TH00004', netAmount: -700000, refundAmount: 700000, extraAmount: 0, debtOffset: 0 });
    });

    it('trả + mua thêm: `exchanges`; mua nhiều hơn trả → extraAmount = net dương và payments đi kèm', async () => {
      const { service, createExchange, checkoutReturn } = build([], { netAmount: 300000 });
      const result = await service.exchange(
        {
          originalInvoiceId: 'inv-1',
          returnLines: [{ originalInvoiceItemId: 'it-1', quantity: 1 }],
          newLines: [
            { itemId: 'i-9', itemCode: 'C', itemName: 'Áo C', unit: 'Cái', quantity: 1, unitPrice: 1000000, lineDiscount: 250000, note: 'Khách dặn gói riêng' },
          ],
          refundMethod: 'cash' as never,
          payments: [{ method: 'cash' as never, amount: 300000 }],
        },
        actor,
      );
      const [dto] = createExchange.create.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(dto).toMatchObject({ sessionId: 'ses-1', originalInvoiceId: 'inv-1' });
      // Khoản giảm khuyến mại và ghi chú của DÒNG phải đi trọn xuống lệnh tạo
      // hoá đơn đổi — app bày một mức giảm rồi máy chủ thu giá gốc là một lời
      // hứa bị nuốt giữa hai tầng.
      expect((dto.newLines as Array<Record<string, unknown>>)[0]).toMatchObject({
        itemId: 'i-9',
        unitPrice: 1000000,
        lineDiscount: 250000,
        note: 'Khách dặn gói riêng',
      });
      const [, checkoutDto] = checkoutReturn.checkout.mock.calls[0] as unknown as [string, { payments: Array<Record<string, unknown>> }];
      expect(checkoutDto.payments).toEqual([{ paymentMethod: 'cash', amount: 300000, paymentAccountId: undefined }]);
      expect(result).toMatchObject({ netAmount: 300000, extraAmount: 300000 });
    });

    it('HĐ gốc còn nợ → debtOffset đọc từ checkout-return; trả quá số cho phép hoặc dòng đã trả hết → 400', async () => {
      const { service, createReturn } = build([], { originalDebt: 100000 });
      const result = await service.exchange({ originalInvoiceId: 'inv-1', returnLines: [{ originalInvoiceItemId: 'it-1', quantity: 2 }], refundMethod: 'cash' as never }, actor);
      expect(result.debtOffset).toBe(100000);
      await expect(service.exchange({ originalInvoiceId: 'inv-1', returnLines: [{ originalInvoiceItemId: 'it-1', quantity: 3 }], refundMethod: 'cash' as never }, actor)).rejects.toThrow('chỉ còn trả được 2');
      await expect(service.exchange({ originalInvoiceId: 'inv-1', returnLines: [{ originalInvoiceItemId: 'it-2', quantity: 1 }], refundMethod: 'cash' as never }, actor)).rejects.toThrow('chỉ còn trả được 0');
      expect(createReturn.create).toHaveBeenCalledTimes(1);
    });

    it('chuyển khoản: cần tài khoản có deposit account → refundAccountId; thiếu → 400', async () => {
      const { service, checkoutReturn } = build([]);
      await service.exchange({ originalInvoiceId: 'inv-1', returnLines: [{ originalInvoiceItemId: 'it-1', quantity: 1 }], refundMethod: 'bank' as never, paymentAccountId: 'pa-bank' }, actor);
      expect((checkoutReturn.checkout.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]).toMatchObject({ refundMethod: 'BANK', refundAccountId: 'dep-1' });
      await expect(service.exchange({ originalInvoiceId: 'inv-1', returnLines: [{ originalInvoiceItemId: 'it-1', quantity: 1 }], refundMethod: 'bank' as never }, actor)).rejects.toThrow('chọn tài khoản');
    });
  });
  describe('báo cáo hoạt động ca (T-21-01)', () => {
    const summary = {
      revenue: { cash: 400000, card: 100000, bankTransfer: 50000, voucher: 0, points: 0, total: 550000 },
      expense: { cash: 0, bankTransfer: 0, total: 0 },
      netCashFlow: 550000,
      debt: { newDebt: 250000, debtCollected: 70000 },
      goodsSold: { quantity: 3, value: 1500000 },
      goodsReturned: { quantity: 1, value: 750000 },
      other: {},
    };

    it('chưa mở ca → session null, không số', async () => {
      const { service } = build([]);
      await expect(service.shiftReport(actor)).resolves.toEqual({ session: null, totals: null, groups: [] });
    });

    it('ca qua đêm: cửa sổ là openedAt..now (không cắt theo ngày), cashierId = người mở, chi nhánh của phiên; sáu nhóm MISA', async () => {
      const openedAt = new Date('2026-09-13T22:30:00.000Z');
      const session = { id: 'ses-1', status: SessionStatus.ACTIVE_SALES, openedAt, openedBy: 'u-cashier', branchId: 'br-1', closedAt: null };
      const { service, queryBus, repo } = build([session]);
      // `findOne` của fixture chỉ trả phiên CLOSING; báo cáo ca tra phiên đang mở/đang bán.
      (repo.findOne as jest.Mock).mockResolvedValueOnce(session);
      (queryBus.execute as jest.Mock).mockResolvedValueOnce(summary);
      const before = Date.now();
      const report = await service.shiftReport(actor);
      const dto = (queryBus.execute.mock.calls[0] as unknown as [{ dto: { issuedAt: { from: string; to: string }; cashierId: string; branchId: string } }])[0].dto;
      expect(dto.issuedAt.from).toBe('2026-09-13T22:30:00.000Z');
      expect(new Date(dto.issuedAt.to).getTime()).toBeGreaterThanOrEqual(before);
      expect(dto.cashierId).toBe('u-cashier');
      expect(dto.branchId).toBe('br-1');
      expect(report.session).toMatchObject({ id: 'ses-1', openedBy: 'u-cashier' });
      // Tiền mặt tổng = doanh thu tiền mặt (đã trừ trả) + thu nợ; nhóm bán tại cửa hàng cộng lại hàng trả để bày dương, đổi trả âm.
      expect(report.totals).toEqual({ cash: 470000, card: 150000, total: 620000 });
      expect(report.groups.map((g) => [g.key, g.total])).toEqual([
        ['store', 1150000 + 100000 + 50000 + 250000],
        ['delivery', 0],
        ['returns', -750000],
        ['debtCollection', 70000],
        ['deposit', 0],
        ['depositRefund', 0],
      ]);
    });
  });
});
