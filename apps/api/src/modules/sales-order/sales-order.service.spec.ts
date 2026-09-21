import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SalesOrderService } from './sales-order.service';
import { SalesOrderStatus } from './entities/sales-order.entity';

/**
 * Ba luật đáng khoá nhất, và không luật nào nhìn thấy được bằng mắt trên app:
 * tổng do SERVER tính từ dòng, chỉ `SENT` mới chuyển trạng thái được, và phạm
 * vi đọc rẽ theo quyền duyệt chứ không theo tham số.
 */
describe('SalesOrderService', () => {
  const actor = { userId: 'u-1', organizationId: 'org-1', branchId: 'br-1', roles: [] as string[] };

  function build({
    canApprove = false,
    current,
    openSession = true,
    pointBalance = 1000,
  }: {
    canApprove?: boolean;
    current?: Partial<Record<string, unknown>>;
    openSession?: boolean;
    /** Số dư điểm của khách — dùng để dựng ca "tư vấn ghi nhiều hơn khách còn". */
    pointBalance?: number;
  } = {}) {
    const saved: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const manager = {
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => data),
      save: jest.fn(async (_entity: unknown, data: Record<string, unknown> | Record<string, unknown>[]) => {
        if (Array.isArray(data)) return data;
        saved.push(data);
        return { ...data, id: 'so-1' };
      }),
      update: jest.fn(async (_entity: unknown, _id: string, patch: Record<string, unknown>) => {
        updates.push(patch);
      }),
      delete: jest.fn(async () => undefined),
      find: jest.fn(async () => [{ ...lineA, salesOrderId: 'so-1', lineNo: 1 }]),
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => current ?? null),
      })),
    };
    const listQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[], 0]),
    };
    const orders = {
      createQueryBuilder: jest.fn(() => listQb),
      findOne: jest.fn(async () => ({
        id: 'so-1',
        documentNumber: 'DT000001',
        status: SalesOrderStatus.SENT,
        createdAt: new Date('2026-09-13T00:00:00Z'),
        salespersonId: 'sp-1',
        salespersonName: 'Phan Thanh Hà',
        salesChannel: 'Ứng dụng Tư Vấn',
        customerId: null,
        customerName: null,
        customerPhone: null,
        subtotal: '2250000.00',
        discount: '787000.00',
        amountDue: '1463000.00',
        note: null,
        rejectReason: null,
        ...(current ?? {}),
        // `getById` sau `approve` phải thấy `invoiceId` vừa ghi — gộp mọi patch đã update.
        ...Object.assign({}, ...updates),
      })),
    };
    const lines = { find: jest.fn(async () => []) };
    const profiles = {
      findOne: jest.fn(async () => ({ id: 'sp-1', user: { firstName: 'Phan Thanh', lastName: 'Hà' } })),
    };
    const customers = { findOne: jest.fn(async () => null) };
    const items = { find: jest.fn(async ({ where }: { where: { id: { _value: string[] } } }) => (where.id as any)._value.map((id: string) => ({ id }))) };
    const dataSource = { transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)) };
    const numbering = { generate: jest.fn(async () => 'DT000001') };
    const rbac = { hasPermission: jest.fn(async () => canApprove) };

    const invoices = { findOne: jest.fn(async () => ({ id: 'inv-1', code: '2609060002' })) };
    const invoiceService = { createDraftIn: jest.fn(async (..._args: unknown[]) => ({ id: 'inv-1' })) };
    // Trừ điểm GIẢ: ném khi số điểm vượt `pointBalance`, đúng như bản thật.
    // Dùng bản `...In` vì `approve` phải trừ trong CÙNG transaction.
    const points = {
      applyRedemptionIn: jest.fn(async (_m: unknown, _inv: string, requested: number, _actor?: unknown) => {
        if (requested > pointBalance) {
          throw new BadRequestException(`Insufficient points: balance=${pointBalance}, requested=${requested}`);
        }
        return { id: 'inv-1', pointsRedeemed: requested };
      }),
    };
    const posSessions = {
      findOpenForBranch: jest.fn(async () => {
        if (!openSession) throw new ConflictException({ code: 'NO_OPEN_SESSION', message: 'Chi nhánh chưa mở ca' });
        return { id: 'ses-1' };
      }),
    };
    const service = new SalesOrderService(
      orders as never,
      lines as never,
      profiles as never,
      customers as never,
      items as never,
      invoices as never,
      dataSource as never,
      numbering as never,
      rbac as never,
      invoiceService as never,
      posSessions as never,
      points as never,
    );
    return { service, saved, updates, manager, listQb, numbering, invoiceService, posSessions, points };
  }

  const lineA = { itemId: 'i-1', itemCode: 'A', itemName: 'A', unit: 'Cái', quantity: 2, unitPrice: 800000, manualDiscount: 160000, promotionDiscount: 432000, promotionName: 'Giảm giá 30%' };
  const lineB = { itemId: 'i-2', itemCode: 'B', itemName: 'B', unit: 'Cái', quantity: 1, unitPrice: 650000, promotionDiscount: 195000 };

  it('create: tổng do SERVER tính từ dòng — subtotal gộp, discount = KM + giảm tay, amountDue là hiệu', async () => {
    const { service, saved, numbering, manager } = build();

    await service.create({ lines: [lineA, lineB] }, actor);

    expect(saved[0]).toMatchObject({ subtotal: '2250000', discount: '787000', amountDue: '1463000', documentNumber: 'DT000001' });
    // Sinh số TRONG transaction — truyền manager, không mượn connection thứ hai.
    expect(numbering.generate).toHaveBeenCalledWith(expect.anything(), 'br-1', actor, manager);
  });

  it('create: giảm vượt thành tiền của một dòng thì 400, không ghi', async () => {
    const { service, saved } = build();
    await expect(
      service.create({ lines: [{ ...lineB, manualDiscount: 500000 }] }, actor),
    ).rejects.toThrow('vượt thành tiền');
    expect(saved).toHaveLength(0);
  });

  it('approve: tạo hoá đơn NHÁP từ đơn trong cùng giao dịch, ghi liên kết hai chiều, rồi PROCESSED', async () => {
    const { service, updates, manager, invoiceService, posSessions } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', branchId: 'br-1', customerId: 'c-1' } });
    const view = await service.approve('so-1', actor);

    expect(posSessions.findOpenForBranch).toHaveBeenCalledWith('br-1', actor, manager);
    const [mgr, dto, draftActor] = invoiceService.createDraftIn.mock.calls[0] as [unknown, { sessionId: string; customerId?: string; salespersonId: string; items: Array<Record<string, unknown>> }, { branchId?: string }];
    expect(mgr).toBe(manager);
    expect(dto).toMatchObject({ sessionId: 'ses-1', customerId: 'c-1', salespersonId: 'sp-1' });
    // CHỈ giảm tay (ADR-50): 160.000, không phải 592.000 = tay + KM 432.000 như
    // trước — saga tính lại KM lúc thu, gộp vào đây là trừ KM hai lần (A-87).
    expect(dto.items[0]).toMatchObject({ itemId: 'i-1', quantity: 2, unitPrice: 800000, lineDiscount: 160000 });
    expect(dto.items[0].lineDiscountReason).toBeUndefined();
    // Hoá đơn thuộc chi nhánh của ĐƠN.
    expect(draftActor.branchId).toBe('br-1');
    expect(updates.some((u) => u.salesOrderId === 'so-1')).toBe(true);
    expect(updates.some((u) => u.status === SalesOrderStatus.PROCESSED && u.invoiceId === 'inv-1')).toBe(true);
    expect(view.invoiceCode).toBe('2609060002');
  });

  it('approve: lý do giảm dòng CHỈ là lý do giảm tay — không mang tên CTKM của đơn', async () => {
    const { service, manager, invoiceService } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', branchId: 'br-1' } });
    manager.find.mockResolvedValueOnce([
      { ...lineA, manualDiscountReason: 'Khách quen', salesOrderId: 'so-1', lineNo: 1 },
      { ...lineB, manualDiscount: 0, manualDiscountReason: null, promotionName: 'Mua 2 tặng 1', salesOrderId: 'so-1', lineNo: 2 },
    ] as never);

    await service.approve('so-1', actor);

    const [, dto] = invoiceService.createDraftIn.mock.calls[0] as [unknown, { items: Array<Record<string, unknown>> }];
    expect(dto.items[0]).toMatchObject({ lineDiscount: 160000, lineDiscountReason: 'Khách quen' });
    expect(dto.items[1]).toMatchObject({ lineDiscount: 0, lineDiscountReason: undefined });
    for (const item of dto.items) {
      expect(String(item.lineDiscountReason ?? '')).not.toMatch(/Giảm giá 30%|Mua 2 tặng 1/);
    }
  });

  it('lựa chọn CTKM ghi lên đơn lúc tạo VÀ lúc sửa; vắng khoá khi sửa = xoá lựa chọn (thay trọn đơn)', async () => {
    const sel = ['7f1c2b8e-4a3d-4c5e-9f10-2b3c4d5e6f70'];
    const exc = ['0b1c2d3e-4f50-4a6b-8c7d-8e9f0a1b2c3d'];

    const created = build();
    await created.service.create({ lines: [lineB], selectedProgramIds: sel, excludedProgramIds: exc }, actor);
    expect(created.saved[0]).toMatchObject({ selectedProgramIds: sel, excludedProgramIds: exc });

    const edited = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', createdBy: 'u-1' } });
    await edited.service.update('so-1', { lines: [lineB], excludedProgramIds: exc }, actor);
    expect(edited.updates[0]).toMatchObject({ selectedProgramIds: [], excludedProgramIds: exc });

    const bare = build();
    await bare.service.create({ lines: [lineB] }, actor);
    expect(bare.saved[0]).toMatchObject({ selectedProgramIds: [], excludedProgramIds: [] });
  });

  it('view của đơn trả lựa chọn CTKM để app nạp lại khi sửa; đơn cũ không có cột → []', async () => {
    const withSel = build({ current: { selectedProgramIds: ['p-1'], excludedProgramIds: ['p-2'] } });
    await expect(withSel.service.getById('so-1', actor)).resolves.toMatchObject({ selectedProgramIds: ['p-1'], excludedProgramIds: ['p-2'] });

    const legacy = build();
    await expect(legacy.service.getById('so-1', actor)).resolves.toMatchObject({ selectedProgramIds: [], excludedProgramIds: [] });
  });

  it('approve khi chi nhánh CHƯA mở ca → 409 NO_OPEN_SESSION, đơn KHÔNG đổi trạng thái, không tạo nháp', async () => {
    const { service, updates, invoiceService } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', branchId: 'br-1' }, openSession: false });
    await expect(service.approve('so-1', actor)).rejects.toMatchObject({ response: { code: 'NO_OPEN_SESSION' } });
    expect(invoiceService.createDraftIn).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('approve với điểm dự kiến: trừ ĐÚNG số điểm, trong CÙNG transaction, trên hoá đơn vừa tạo', async () => {
    const { service, points, manager } = build({
      current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', branchId: 'br-1', customerId: 'c-1', pointsRedeemed: 20 },
    });

    await service.approve('so-1', actor);

    const [mgr, invoiceId, requested, pointActor] = points.applyRedemptionIn.mock.calls[0] as [
      unknown,
      string,
      number,
      { branchId?: string },
    ];
    // `manager` của CHÍNH transaction này — bản repo sẽ chặn trên hàng transaction đang khoá.
    expect(mgr).toBe(manager);
    expect(invoiceId).toBe('inv-1');
    expect(requested).toBe(20);
    // Chi nhánh của ĐƠN, không phải header của người bấm — như lượt tạo nháp.
    expect(pointActor.branchId).toBe('br-1');
  });

  it('đơn KHÔNG ghi điểm thì KHÔNG gọi đường trừ điểm', async () => {
    const { service, points } = build({
      current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', branchId: 'br-1', customerId: 'c-1' },
    });

    await service.approve('so-1', actor);

    expect(points.applyRedemptionIn).not.toHaveBeenCalled();
  });

  it('điểm dự kiến VƯỢT số dư → ném, và đơn KHÔNG bao giờ tới PROCESSED', async () => {
    // Luật "chặn" mà Loc chốt 2026-09-15. Thứ test này chứng minh được: lượt trừ
    // điểm chạy TRƯỚC khi đơn được đánh dấu xử lý, nên không có đường nào để một
    // đơn PROCESSED tồn tại cạnh một hoá đơn chưa được giảm.
    //
    // Thứ nó KHÔNG chứng minh được, và phải nói ra: bản ghi hoá đơn nháp đã
    // được `createDraftIn` ghi trước đó *có* nằm trong `updates` của manager
    // giả. Ở thật, cả hai cùng một transaction nên chúng cuộn lại với nhau —
    // đó là việc của Postgres, không phải của một `jest.fn()`. Kiểm vế ấy cần
    // một lượt gọi API thật (ghi trong `07-verification.md`).
    const { service, updates } = build({
      current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', branchId: 'br-1', customerId: 'c-1', pointsRedeemed: 500 },
      pointBalance: 100,
    });

    await expect(service.approve('so-1', actor)).rejects.toThrow(/Insufficient points/);
    expect(updates.some((u) => u.status === SalesOrderStatus.PROCESSED)).toBe(false);
    expect(updates.some((u) => u.invoiceId === 'inv-1')).toBe(false);
  });

  it('approve một đơn KHÔNG còn SENT → 409, không ghi đè', async () => {
    const { service, updates } = build({ current: { status: SalesOrderStatus.REJECTED, salespersonId: 'sp-1' } });
    await expect(service.approve('so-1', actor)).rejects.toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0);
  });

  it('cancel đơn của NGƯỜI KHÁC → 404 (không xác nhận sự tồn tại)', async () => {
    const { service } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-9' } });
    await expect(service.cancel('so-1', undefined, actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reject ghi lý do và đổi trạng thái trong CÙNG một update', async () => {
    const { service, updates } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1' } });
    await service.reject('so-1', '  Hết hàng trong kho ', actor);
    expect(updates[0]).toMatchObject({ status: SalesOrderStatus.REJECTED, rejectReason: 'Hết hàng trong kho' });
  });

  it('create với isDraft → DRAFT; update DRAFT không isDraft → SENT (lưu tạm rồi gửi)', async () => {
    const created = build();
    await created.service.create({ lines: [lineB], isDraft: true }, actor);
    expect(created.saved[0]).toMatchObject({ status: SalesOrderStatus.DRAFT });

    const sent = build({ current: { status: SalesOrderStatus.DRAFT, salespersonId: 'sp-1', createdBy: 'u-1' } });
    await sent.service.update('so-1', { lines: [lineB] }, actor);
    expect(sent.updates[0]).toMatchObject({ status: SalesOrderStatus.SENT });
  });

  it('update SENT với isDraft → 400: đơn đã tới thu ngân không rút về lưu tạm', async () => {
    const { service, updates } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1' } });
    await expect(service.update('so-1', { lines: [lineB], isDraft: true }, actor)).rejects.toThrow('không lưu tạm');
    expect(updates).toHaveLength(0);
  });

  it('cancel một đơn LƯU TẠM ghi lý do và về CANCELLED (không có xoá)', async () => {
    const { service, updates } = build({ current: { status: SalesOrderStatus.DRAFT, salespersonId: 'sp-1' } });
    await service.cancel('so-1', '  Khách đổi ý ', actor);
    expect(updates[0]).toMatchObject({ status: SalesOrderStatus.CANCELLED, cancelReason: 'Khách đổi ý' });
  });

  it('list mặc định LOẠI đơn lưu tạm; xin DRAFT thì luôn thu về CỦA MÌNH, kể cả người có quyền duyệt', async () => {
    const mine = build({ canApprove: false });
    await mine.service.list({}, actor);
    expect(mine.listQb.andWhere).toHaveBeenCalledWith('so.status <> :draft', { draft: SalesOrderStatus.DRAFT });

    // Lượt e2e 2026-09-13 đỏ vì bản trước loại draft của chính người có quyền duyệt.
    const branch = build({ canApprove: true });
    await branch.service.list({ status: SalesOrderStatus.DRAFT }, actor);
    expect(branch.listQb.andWhere).toHaveBeenCalledWith('(so.salespersonId = :sp OR so.createdBy = :me)', { sp: 'sp-1', me: 'u-1' });
    expect(branch.listQb.andWhere).toHaveBeenCalledWith('so.status = :status', { status: SalesOrderStatus.DRAFT });
  });

  it('list: KHÔNG có quyền duyệt thì thu về đơn của mình; CÓ thì thấy cả chi nhánh', async () => {
    const mine = build({ canApprove: false });
    await mine.service.list({}, actor);
    expect(mine.listQb.andWhere).toHaveBeenCalledWith('(so.salespersonId = :sp OR so.createdBy = :me)', { sp: 'sp-1', me: 'u-1' });

    const branch = build({ canApprove: true });
    await branch.service.list({}, actor);
    expect(branch.listQb.andWhere).not.toHaveBeenCalledWith('(so.salespersonId = :sp OR so.createdBy = :me)', expect.anything());
  });
});
