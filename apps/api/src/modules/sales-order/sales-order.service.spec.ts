import { ConflictException, NotFoundException } from '@nestjs/common';
import { SalesOrderService } from './sales-order.service';
import { SalesOrderStatus } from './entities/sales-order.entity';

/**
 * Ba luật đáng khoá nhất, và không luật nào nhìn thấy được bằng mắt trên app:
 * tổng do SERVER tính từ dòng, chỉ `SENT` mới chuyển trạng thái được, và phạm
 * vi đọc rẽ theo quyền duyệt chứ không theo tham số.
 */
describe('SalesOrderService', () => {
  const actor = { userId: 'u-1', organizationId: 'org-1', branchId: 'br-1', roles: [] as string[] };

  function build({ canApprove = false, current }: { canApprove?: boolean; current?: Partial<Record<string, unknown>> } = {}) {
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

    const service = new SalesOrderService(
      orders as never,
      lines as never,
      profiles as never,
      customers as never,
      items as never,
      dataSource as never,
      numbering as never,
      rbac as never,
    );
    return { service, saved, updates, manager, listQb, numbering };
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

  it('approve một đơn KHÔNG còn SENT → 409, không ghi đè', async () => {
    const { service, updates } = build({ current: { status: SalesOrderStatus.REJECTED, salespersonId: 'sp-1' } });
    await expect(service.approve('so-1', actor)).rejects.toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0);
  });

  it('cancel đơn của NGƯỜI KHÁC → 404 (không xác nhận sự tồn tại)', async () => {
    const { service } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-9' } });
    await expect(service.cancel('so-1', actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reject ghi lý do và đổi trạng thái trong CÙNG một update', async () => {
    const { service, updates } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1' } });
    await service.reject('so-1', '  Hết hàng trong kho ', actor);
    expect(updates[0]).toMatchObject({ status: SalesOrderStatus.REJECTED, rejectReason: 'Hết hàng trong kho' });
  });

  it('list: KHÔNG có quyền duyệt thì thu về đơn của mình; CÓ thì thấy cả chi nhánh', async () => {
    const mine = build({ canApprove: false });
    await mine.service.list({}, actor);
    expect(mine.listQb.andWhere).toHaveBeenCalledWith('so.salespersonId = :sp', { sp: 'sp-1' });

    const branch = build({ canApprove: true });
    await branch.service.list({}, actor);
    expect(branch.listQb.andWhere).not.toHaveBeenCalledWith('so.salespersonId = :sp', expect.anything());
  });
});
