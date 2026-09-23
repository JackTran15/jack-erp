import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentType } from '@erp/shared-interfaces';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CASHIER_PERMISSION_KEYS,
  SYSTEM_ADMIN_PERMISSION_KEYS,
} from '../../database/seeds/org-role-permissions';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators';
import { BranchEntity } from '../branch/branch.entity';
import { ItemEntity } from '../inventory/location/item.entity';
import { InvoiceService } from '../pos/services/invoice.service';
import { PermissionGuard } from '../rbac/permission.guard';
import { AdminSalesOrderController } from './controllers/admin-sales-order.controller';
import { SALES_ORDER_PERMISSIONS, SalesOrderService, normalizePartnerPhone } from './sales-order.service';
import type { PartnerCreateOrderDto } from './dto/partner-create-order.dto';
import { ReturnSalesOrderDto } from './dto/return-sales-order.dto';
import { UNASSIGNED_BRANCH_FILTER } from './dto/sales-order-list.query.dto';
import type { SalesChannelEntity } from './entities/sales-channel.entity';
import { SalesOrderDispatchAction } from './entities/sales-order-dispatch-event.entity';
import { SalesOrderLineEntity } from './entities/sales-order-line.entity';
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
    canReadAll = false,
    canDispatch = false,
    branchExists = true,
    current,
    openSession = true,
    pointBalance = 1000,
    rows = [],
    branches = [],
  }: {
    canApprove?: boolean;
    /** `pos.sales-order.read-all` — phạm vi TOÀN CHUỖI của đường đọc Admin. */
    canReadAll?: boolean;
    /**
     * `pos.sales-order.dispatch` — quyền ĐIỀU PHỐI cấp tổ chức.
     *
     * Tách hẳn khỏi {@link canApprove}: `returnToPool` rẽ nhánh theo đúng khoá
     * này (có → trả về được đơn của mọi chi nhánh; không → chỉ đơn chi nhánh
     * mình đang giữ), nên một bộ giả trả cùng câu trả lời cho hai khoá sẽ làm
     * ca 403 xanh nhầm.
     */
    canDispatch?: boolean;
    /** `false` = `branchId` truyền vào `dispatch` không thuộc tổ chức của actor. */
    branchExists?: boolean;
    current?: Partial<Record<string, unknown>>;
    openSession?: boolean;
    /** Số dư điểm của khách — dùng để dựng ca "tư vấn ghi nhiều hơn khách còn". */
    pointBalance?: number;
    /** Hàng `sales_orders` mà `list()` đọc được; mặc định rỗng như trước. */
    rows?: Record<string, unknown>[];
    /**
     * Hàng `branches` mà lượt tra TÊN chi nhánh đọc được.
     *
     * Cố ý tách khỏi {@link rows}: `sales_orders.branch_id` KHÔNG có FK, nên
     * "đơn trỏ vào một chi nhánh không còn trong bảng" là trạng thái có thật —
     * dựng nó bằng cách cho `rows` một `branchId` mà `branches` không có.
     */
    branches?: { id: string; name: string; organizationId: string }[];
  } = {}) {
    const saved: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const dispatchEvents: Record<string, unknown>[] = [];

    /**
     * Bản giả của `UPDATE sales_orders SET branch_id = :b WHERE id = :id AND
     * branch_id IS NULL`: chi nhánh đang giữ đơn là TRẠNG THÁI, nên lượt phân
     * thứ hai thật sự đổi được 0 dòng thay vì được một hằng số dựng sẵn.
     */
    let heldBranch: string | null = (current?.branchId as string | undefined) ?? null;
    let pendingSet: Record<string, unknown> | null = null;
    // Chú thích kiểu tường minh: `update()`/`where()` trả về chính đối tượng
    // đang khai, nên thiếu nó TS không suy được kiểu (TS7022).
    const updateQb: Record<string, jest.Mock> = {
      update: jest.fn(() => updateQb),
      set: jest.fn((patch: Record<string, unknown>) => {
        pendingSet = patch;
        return updateQb;
      }),
      where: jest.fn(() => updateQb),
      andWhere: jest.fn(() => updateQb),
      execute: jest.fn(async () => {
        const patch = pendingSet as Record<string, unknown> | null;
        // `returnToPool` set `branchId: () => 'NULL'` (cách TypeORM nhận NULL ở
        // `set()`), nên MỘT HÀM ở đây nghĩa là lượt TRẢ VỀ. Điều kiện của nó là
        // `branch_id = :from`, tức ngược hẳn lượt phân: chỉ thắng khi đơn ĐANG
        // có chi nhánh. Ghi lại dưới dạng `{ branchId: null }` để `updates` đọc
        // được và để `orders.findOne` thấy đúng giá trị sau lượt ghi.
        if (patch && typeof patch.branchId === 'function') {
          if (!heldBranch) return { affected: 0 };
          heldBranch = null;
          updates.push({ branchId: null });
          return { affected: 1 };
        }
        if (heldBranch) return { affected: 0 };
        if (patch) {
          heldBranch = patch.branchId as string;
          updates.push(patch);
        }
        return { affected: 1 };
      }),
    };
    const lockQb: Record<string, jest.Mock> = {
      setLock: jest.fn(() => lockQb),
      where: jest.fn(() => lockQb),
      getOne: jest.fn(async () => (current ? { ...current, branchId: heldBranch ?? undefined } : null)),
    };

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
      insert: jest.fn(async (_entity: unknown, data: Record<string, unknown>) => {
        dispatchEvents.push(data);
        return { identifiers: [{ id: 'ev-1' }] };
      }),
      delete: jest.fn(async () => undefined),
      find: jest.fn(async () => [{ ...lineA, salesOrderId: 'so-1', lineNo: 1 }]),
      // Chi nhánh đích của `dispatch` — `null` khi nó không thuộc tổ chức.
      findOne: jest.fn(async () => (branchExists ? { id: 'br-2' } : null)),
      // Không tham số = builder UPDATE của `dispatch`; có tham số = lượt đọc có khoá.
      createQueryBuilder: jest.fn((...args: unknown[]) => (args.length ? lockQb : updateQb)),
    };
    /**
     * Chi nhánh mà lượt đọc đang khoá vào, bắt từ chính mệnh đề `list()` sinh
     * ra. Nhờ nó `getManyAndCount` LỌC thật thay vì trả nguyên `rows`: "chi
     * nhánh khác không thấy đơn" mới là một phép kiểm về KẾT QUẢ chứ không chỉ
     * về câu SQL.
     */
    let listBranch: string | undefined;
    /**
     * Tổ chức mà lượt đọc khoá vào, bắt từ `where()`. Không có nó thì "đơn của
     * org khác không lọt vào kết quả" chỉ kiểm được CÂU SQL, trong khi thứ đáng
     * kiểm là KẾT QUẢ — mệnh đề `organizationId` phải thật sự cắt được dòng.
     */
    let listOrg: string | undefined;
    /** `true` khi lượt đọc chỉ xin pool (`branch_id IS NULL`). */
    let poolOnly = false;
    const listQb: Record<string, jest.Mock> = {
      where: jest.fn((clause: string, params?: Record<string, unknown>) => {
        if (clause === 'so.organizationId = :org') listOrg = params?.org as string;
        return listQb;
      }),
      andWhere: jest.fn((clause: string, params?: Record<string, unknown>) => {
        if (clause === 'so.branchId = :branch') listBranch = params?.branch as string;
        // Đường đọc cấp tổ chức dùng TÊN THAM SỐ KHÁC (`:branchFilter`) — đó là
        // điều cố ý, để phép kiểm "không khoá theo chi nhánh của header" ở dưới
        // không bị lọc theo `branchId` của Admin làm cho xanh nhầm.
        if (clause === 'so.branchId = :branchFilter') listBranch = params?.branchFilter as string;
        if (clause === 'so.branchId IS NULL') poolOnly = true;
        return listQb;
      }),
      orderBy: jest.fn(() => listQb),
      skip: jest.fn(() => listQb),
      take: jest.fn(() => listQb),
      getManyAndCount: jest.fn(async () => {
        const visible = rows.filter((row) => {
          // `organizationId` vắng mặt trên các hàng dựng sẵn cũ = không quan tâm.
          if (listOrg !== undefined && row.organizationId !== undefined && row.organizationId !== listOrg) {
            return false;
          }
          if (poolOnly) return row.branchId === null || row.branchId === undefined;
          if (listBranch !== undefined) return row.branchId === listBranch;
          return true;
        });
        return [visible, visible.length];
      }),
    };
    const orders = {
      createQueryBuilder: jest.fn(() => {
        listBranch = undefined;
        listOrg = undefined;
        poolOnly = false;
        return listQb;
      }),
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
    /**
     * Bảng `branches` cho lượt tra TÊN của lưới Admin.
     *
     * Lọc theo CẢ `organizationId` như bản thật: không có FK nào buộc
     * `sales_orders.branch_id` trỏ vào chi nhánh cùng tổ chức, nên một id lạc
     * sang org khác phải trả về KHÔNG có hàng — tức không có tên để rò.
     */
    const branchRepo = {
      find: jest.fn(async ({ where }: { where: { id: unknown; organizationId: string } }) => {
        const wanted = (where.id as { _value: string[] })._value;
        return branches.filter((b) => wanted.includes(b.id) && b.organizationId === where.organizationId);
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
      getRepository: jest.fn(() => branchRepo),
    };
    const numbering = { generate: jest.fn(async () => 'DT000001') };
    // Quyền TRA THEO KHOÁ: `read-all` và `approve` là hai phạm vi khác nhau, và
    // một bộ giả trả cùng một câu trả lời cho mọi khoá sẽ che đúng chỗ đó.
    const rbac = {
      hasPermission: jest.fn(async (_userId: string, _org: string, key: string) => {
        if (key === SALES_ORDER_PERMISSIONS.readAll) return canReadAll;
        if (key === SALES_ORDER_PERMISSIONS.dispatch) return canDispatch;
        return canApprove;
      }),
    };

    const invoices = {
      findOne: jest.fn(async () => ({ id: 'inv-1', code: '2609060002' })),
      // Danh sách tra mã hoá đơn theo LÔ (`In(ids)`) — trả mã cho đúng id được hỏi.
      find: jest.fn(async (opts: { where: { id: { _value: string[] } } }) =>
        (opts.where.id._value ?? []).map((id: string) => ({ id, code: `HD-${id}` })),
      ),
    };
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
    // ADR-06: huỷ đơn gọi lại đường đảo của hoá đơn POS. Mặc định thành công;
    // từng test có thể cho nó ném để kiểm ca rollback.
    const cancelInvoiceService = {
      cancel: jest.fn(async (..._args: unknown[]) => ({ id: 'inv-1' })),
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
      cancelInvoiceService as never,
    );
    return { service, saved, updates, dispatchEvents, manager, listQb, numbering, invoiceService, posSessions, points, orders, lines, rbac, branchRepo, dataSource, cancelInvoiceService, invoices };
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
    // Ghi dạng type/value để pos-web round-trip được khi thu ngân mở "HĐ lưu tạm"
    // rồi thanh toán (pos-web không gửi lại `lineDiscount` số tiền; thiếu type/value là
    // khách bị tính dư — run_sales_flow.py mục E).
    expect(dto.items[0]).toMatchObject({ itemId: 'i-1', quantity: 2, unitPrice: 800000, lineDiscountType: 'amount', lineDiscountValue: 160000 });
    expect(dto.items[0]).not.toHaveProperty('lineDiscount');
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
    expect(dto.items[0]).toMatchObject({ lineDiscountType: 'amount', lineDiscountValue: 160000, lineDiscountReason: 'Khách quen' });
    expect(dto.items[1]).not.toHaveProperty('lineDiscountType');
    expect(dto.items[1]).toMatchObject({ lineDiscountReason: undefined });
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

  /**
   * Phí giao và kênh bán KHÔNG đi qua `CreateInvoiceDto` — dto ấy là `@Body()`
   * của `POST /pos/invoices`, và phí đi thẳng vào `amount_due` rồi thành số
   * shipper thu hộ. Phí đi qua tham số server-only của `createDraftIn`
   * (`DraftInvoiceServerFields`), kênh đi qua lượt `update` ngay sau đó.
   *
   * Nhóm này khoá cả hai, và khoá luôn CON SỐ: chỉ kiểm lời gọi thì việc
   * `amount_due` có gồm phí hay không vẫn chưa ai chứng minh, nên bộ tham số
   * mà `approve` vừa dựng được chạy tiếp qua một `InvoiceService` THẬT.
   */
  describe('approve: chép phí giao + kênh bán sang hoá đơn (T-05-01)', () => {
    /** Một dòng 1.000.000 tròn — đúng kịch bản demo của UOW-05. */
    const goodsLine = {
      itemId: 'i-1',
      itemCode: 'SKU-500',
      itemName: 'SKU-500',
      unit: 'Cái',
      quantity: 1,
      unitPrice: 1000000,
      manualDiscount: 0,
      promotionDiscount: 0,
    };

    /**
     * `InvoiceService` THẬT trên một `EntityManager` giả. `createDraftIn` chỉ
     * cần hai lượt đọc: danh mục hàng (`ItemEntity`) và kho của chi nhánh —
     * trả `[]` cho kho là đủ, `resolveBranchItemLocations` khi đó không gán vị
     * trí nào và phần TIỀN, thứ duy nhất đang kiểm, không phụ thuộc vào nó.
     */
    function realInvoiceService() {
      const savedInvoices: Record<string, unknown>[] = [];
      const manager = {
        create: (_entity: unknown, data: Record<string, unknown>) => data,
        save: jest.fn(async (data: unknown) => {
          if (Array.isArray(data)) return data;
          savedInvoices.push(data as Record<string, unknown>);
          return { ...(data as Record<string, unknown>), id: 'inv-1' };
        }),
        findBy: jest.fn(async (entity: unknown, where: Record<string, { _value: string[] }>) =>
          entity === ItemEntity
            ? where.id._value.map((id) => ({ id, sellingPrice: 0, purchasePrice: 0 }))
            : [],
        ),
        // Hồ sơ NVBH mà `resolveSalespersonProfileId` tra — `approve` chép
        // `salespersonId` của đơn sang dto, nên lượt tra này có thật.
        findOne: jest.fn(async () => ({ id: 'sp-1' })),
      };
      const nil = {} as never;
      const service = new InvoiceService(nil, nil, nil, nil, nil, nil, nil, nil);
      return { service, manager, savedInvoices };
    }

    /** Chạy `approve`, trả về đúng bộ tham số nó đưa cho `createDraftIn`. */
    async function approveAndCaptureDraftArgs(current: Record<string, unknown>) {
      const ctx = build({
        current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', branchId: 'br-1', customerId: 'c-1', ...current },
      });
      (ctx.manager.find as jest.Mock).mockResolvedValue([{ ...goodsLine, salesOrderId: 'so-1', lineNo: 1 }]);

      await ctx.service.approve('so-1', actor);

      const [, dto, draftActor, serverFields] = ctx.invoiceService.createDraftIn.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown> | undefined,
      ];
      return { ...ctx, dto, draftActor, serverFields };
    }

    it('đơn web có phí 30.000 → hoá đơn nháp mang phí, amount_due = tiền hàng + phí', async () => {
      const { dto, draftActor, serverFields } = await approveAndCaptureDraftArgs({
        salesChannel: 'Website công ty',
        // Cột numeric về từ TypeORM là CHUỖI — `approve` phải tự ép.
        shippingFee: '30000.00',
      });

      expect(serverFields).toEqual({ shippingFeeAmount: 30000 });

      const real = realInvoiceService();
      await real.service.createDraftIn(real.manager as never, dto as never, draftActor as never, serverFields as never);
      expect(real.savedInvoices[0]).toMatchObject({
        subtotal: 1000000,
        shippingFeeAmount: 30000,
        amountDue: 1030000,
      });
    });

    it('đơn mobile không có phí → shipping_fee_amount = 0, amount_due y như trước', async () => {
      const { dto, draftActor, serverFields } = await approveAndCaptureDraftArgs({
        salesChannel: 'Ứng dụng Tư Vấn',
      });

      expect(serverFields).toEqual({ shippingFeeAmount: 0 });

      const real = realInvoiceService();
      await real.service.createDraftIn(real.manager as never, dto as never, draftActor as never, serverFields as never);
      expect(real.savedInvoices[0]).toMatchObject({
        subtotal: 1000000,
        shippingFeeAmount: 0,
        amountDue: 1000000,
      });
    });

    it('kênh bán của đơn và sales_order_id ghi lên hoá đơn', async () => {
      const { updates } = await approveAndCaptureDraftArgs({
        salesChannel: 'Website công ty',
        shippingFee: '30000.00',
      });

      expect(updates).toContainEqual(
        expect.objectContaining({ salesOrderId: 'so-1', salesChannel: 'Website công ty' }),
      );
    });
  });

  it('cancel đơn của NGƯỜI KHÁC → 404 (không xác nhận sự tồn tại)', async () => {
    const { service } = build({ current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-9' } });
    await expect(service.cancel('so-1', undefined, actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('cancel: đảo hoá đơn qua CancelInvoiceService (T-07-01, ADR-06)', () => {
    it('đơn CHƯA có hoá đơn → CANCELLED, KHÔNG gọi CancelInvoiceService', async () => {
      const { service, updates, cancelInvoiceService } = build({
        current: { status: SalesOrderStatus.SENT, salespersonId: 'sp-1', invoiceId: null },
      });

      await service.cancel('so-1', '  Khách đổi ý ', actor);

      expect(updates[0]).toMatchObject({
        status: SalesOrderStatus.CANCELLED,
        cancelReason: 'Khách đổi ý',
      });
      // Không có gì để đảo thì không được gọi — gọi thừa là đảo kho của hoá đơn khác.
      expect(cancelInvoiceService.cancel).not.toHaveBeenCalled();
    });

    it('đơn ĐÃ có hoá đơn → gọi CancelInvoiceService ĐÚNG MỘT LẦN với đúng invoiceId, trong cùng transaction', async () => {
      const { service, updates, cancelInvoiceService, manager } = build({
        current: {
          status: SalesOrderStatus.PROCESSED,
          salespersonId: 'sp-1',
          invoiceId: 'inv-77',
        },
      });

      await service.cancel('so-1', 'Khách báo huỷ', actor);

      expect(cancelInvoiceService.cancel).toHaveBeenCalledTimes(1);
      const [invoiceId, dto, passedActor, passedManager] = cancelInvoiceService.cancel.mock
        .calls[0] as unknown[];
      expect(invoiceId).toBe('inv-77');
      expect(dto).toMatchObject({ reason: 'Khách báo huỷ' });
      expect(passedActor).toBe(actor);
      // Tham số thứ 4 là manager của CHÍNH transaction này — đó là thứ làm cho
      // "đơn CANCELLED mà hoá đơn còn sống" không thể tồn tại.
      expect(passedManager).toBe(manager);
      expect(updates[0]).toMatchObject({ status: SalesOrderStatus.CANCELLED });
    });

    it('hoá đơn từ chối huỷ → ném ra ngoài, đơn KHÔNG đổi trạng thái (rollback)', async () => {
      const { service, updates, cancelInvoiceService } = build({
        current: {
          status: SalesOrderStatus.PROCESSED,
          salespersonId: 'sp-1',
          invoiceId: 'inv-77',
        },
      });
      cancelInvoiceService.cancel.mockRejectedValueOnce(
        new ConflictException({
          code: 'INVOICE_NOT_CANCELLABLE',
          message: 'Hoá đơn không huỷ được',
        }),
      );

      await expect(service.cancel('so-1', 'Khách báo huỷ', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );

      // `updates` ghi lại lệnh đã phát; transaction thật sẽ rollback nó. Điều
      // phải đúng ở đây là KHÔNG có commit nào đi qua — service ném ra ngoài
      // thay vì nuốt lỗi và để đơn ở CANCELLED.
      expect(cancelInvoiceService.cancel).toHaveBeenCalledTimes(1);
    });

    it('PROCESSED chỉ mở lối CANCELLED — không mở lối SENT (T-06-01 vẫn đúng)', async () => {
      const { service } = build({
        current: { status: SalesOrderStatus.PROCESSED, salespersonId: 'sp-1', invoiceId: 'inv-77' },
      });
      // returnToPool đưa đơn về SENT/pool; đơn đã có hoá đơn phải bị chặn.
      await expect(service.returnToPool('so-1', 'thử', actor)).rejects.toBeTruthy();
    });
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

  /**
   * Đường ĐỌC của đơn web (T-05-07). `createFromPartner` GHI đủ tám cột đơn web
   * từ T-01-02, nhưng trước ticket này `toView` không đọc lại cột nào — lưới
   * `/orders` vì thế render 0/rỗng cho phí giao, người nhận và địa chỉ kể cả với
   * một đơn web thật.
   */
  describe('toView trả về các cột đơn web', () => {
    /** Một hàng `sales_orders` như Postgres trả về: tiền là CHUỖI, không phải số. */
    const webOrderRow = {
      id: 'so-web',
      documentNumber: 'DT000009',
      status: SalesOrderStatus.SENT,
      createdAt: new Date('2026-09-21T00:00:00Z'),
      // Đơn web ĐÃ được phân về chi nhánh của actor — `list()` cũ hard-filter
      // theo `actor.branchId`, nên một đơn còn trong pool không đọc được ở đây.
      branchId: 'br-1',
      // Đơn web không có tư vấn viên (A-04).
      salespersonId: null,
      salespersonName: null,
      salesChannel: 'Website công ty',
      salesChannelId: 'ch-web',
      externalOrderId: 'WEB-1001',
      customerId: 'c-1',
      customerName: 'Trần Bảo Ngọc',
      customerPhone: '0901234567',
      subtotal: '1000000.00',
      discount: '0.00',
      amountDue: '1000000.00',
      shippingFee: '30000.00',
      recipientName: 'Lê Minh Anh',
      recipientPhone: '0912345678',
      shipProvinceCode: '79',
      shipProvinceName: 'Thành phố Hồ Chí Minh',
      shipWardCode: '26734',
      shipWardName: 'Phường Bến Nghé',
      shipAddressLine: '12 Nguyễn Huệ',
      note: null,
      rejectReason: null,
      cancelReason: null,
    };

    /** Đúng những gì lưới `/orders` đọc — phí giao là SỐ, không phải chuỗi `numeric`. */
    const expectedWebView = {
      shippingFee: 30000,
      recipientName: 'Lê Minh Anh',
      recipientPhone: '0912345678',
      shipProvinceName: 'Thành phố Hồ Chí Minh',
      shipWardName: 'Phường Bến Nghé',
      shipAddressLine: '12 Nguyễn Huệ',
      externalOrderId: 'WEB-1001',
      salesChannelId: 'ch-web',
    };

    it('đơn web đọc qua list VÀ getById đều trả đúng phí giao, người nhận, SĐT, địa chỉ đã lưu', async () => {
      // Thu ngân (có quyền duyệt) thấy cả chi nhánh — đơn web không có
      // `salespersonId` nên vai tư vấn sẽ không đọc được nó.
      const listed = build({ canApprove: true, rows: [webOrderRow] });
      const page = await listed.service.list({}, actor);

      expect(page.total).toBe(1);
      expect(page.data[0]).toMatchObject(expectedWebView);
      // Ép số, không phải chuỗi `numeric` — cùng bài học với `subtotal`.
      expect(typeof page.data[0].shippingFee).toBe('number');

      const detail = build({ canApprove: true, current: webOrderRow });
      const view = await detail.service.getById('so-web', actor);

      expect(view).toMatchObject(expectedWebView);
      expect(typeof view.shippingFee).toBe('number');
    });

    it('đơn mobile cũ: shippingFee = 0, mọi trường mới là null, phần còn lại của view không đổi', async () => {
      // Hàng mặc định của `build` là một đơn tư vấn viên: không cột đơn web nào
      // được ghi, đúng như mọi đơn có trước migration T-01-02.
      const { service } = build();

      const view = await service.getById('so-1', actor);

      expect(view.shippingFee).toBe(0);
      expect(view.recipientName).toBeNull();
      expect(view.recipientPhone).toBeNull();
      expect(view.shipProvinceName).toBeNull();
      expect(view.shipWardName).toBeNull();
      expect(view.shipAddressLine).toBeNull();
      expect(view.externalOrderId).toBeNull();
      expect(view.salesChannelId).toBeNull();
      // Lưới cũ không đổi một ô nào.
      expect(view).toMatchObject({
        id: 'so-1',
        code: 'DT000001',
        status: SalesOrderStatus.SENT,
        salespersonId: 'sp-1',
        salespersonName: 'Phan Thanh Hà',
        salesChannel: 'Ứng dụng Tư Vấn',
        subtotal: 2250000,
        discount: 787000,
        amountDue: 1463000,
        pointsRedeemed: 0,
        invoiceId: null,
      });
    });

    it('tên phường trả về là tên đã CHỐT trên đơn, không phải tên hiện tại trong geo_wards (AC-03)', async () => {
      // Đợt sáp nhập địa giới đổi tên phường sau khi đơn đã đặt: `geo_wards` mã
      // `26734` nay mang tên khác. Đơn cũ phải giữ nguyên cái tên đã in.
      const currentGeoWardName = 'Phường Sài Gòn (sau sáp nhập)';
      const orderWithOldWardName = { ...webOrderRow, shipWardName: 'Phường Bến Nghé' };

      const { service, orders, lines } = build({ canApprove: true, current: orderWithOldWardName });
      const view = await service.getById('so-web', actor);

      expect(view.shipWardName).toBe('Phường Bến Nghé');
      expect(view.shipWardName).not.toBe(currentGeoWardName);
      // Và nó đến từ hàng ĐƠN, không từ một lượt tra `geo_*`: đường đọc chỉ chạm
      // `sales_orders` + `sales_order_lines`, không `relations`, không join nào.
      //
      // Thứ test này KHÔNG chứng minh được, và phải nói ra: `SalesOrderService`
      // không nhận repository `geo_*` nào trong constructor, nên một join là bất
      // khả thi về cấu trúc chứ không phải vì test chặn. Phép kiểm dưới đây là
      // hàng rào cho lần sửa sau — ai thêm `relations`/join vào đường đọc này sẽ
      // làm nó đỏ.
      expect(orders.findOne).toHaveBeenCalledWith({ where: { id: 'so-web', organizationId: 'org-1' } });
      expect(lines.find).toHaveBeenCalledWith({ where: { salesOrderId: 'so-web' }, order: { lineNo: 'ASC' } });
    });
  });

  /**
   * Điều phối cấp tổ chức (T-02-02, AC-09..AC-13).
   *
   * Bốn luật, không luật nào nhìn thấy được trên màn hình: phân đơn KHÔNG cần
   * chi nhánh mở ca, phân lần hai thua ở tầng DB chứ không ghi đè, chỉ đơn còn
   * `SENT` mới phân được, và mỗi lượt phân để lại đúng một vết.
   */
  describe('dispatch', () => {
    /** Một đơn web đang nằm trong pool: `SENT`, chưa có chi nhánh, không tư vấn viên. */
    const pooled = {
      id: 'so-web',
      status: SalesOrderStatus.SENT,
      branchId: null,
      salespersonId: null,
      salespersonName: null,
      salesChannel: 'Website công ty',
    };

    it('chạy được khi chi nhánh KHÔNG có ca POS nào mở, và không sinh hoá đơn nháp (AC-11)', async () => {
      // `openSession: false` = mọi ca của chi nhánh đã đóng. `approve` ở ca này
      // ném `NO_OPEN_SESSION`; điều phối thì không được phép quan tâm (ADR-02).
      const { service, updates, posSessions, invoiceService } = build({
        current: pooled,
        openSession: false,
      });

      await service.dispatch('so-web', 'br-2', actor);

      expect(posSessions.findOpenForBranch).not.toHaveBeenCalled();
      expect(invoiceService.createDraftIn).not.toHaveBeenCalled();
      // Chỉ `branch_id` đổi; trạng thái giữ nguyên `SENT` — phân đơn là giao
      // việc, không phải duyệt.
      expect(updates).toEqual([{ branchId: 'br-2' }]);
    });

    it('ghi đúng MỘT vết điều phối, trong cùng transaction, đủ hình dạng CHECK của bảng (AC-12)', async () => {
      const { service, dispatchEvents, manager } = build({ current: pooled });

      await service.dispatch('so-web', 'br-2', actor);

      expect(dispatchEvents).toEqual([
        {
          organizationId: 'org-1',
          salesOrderId: 'so-web',
          action: SalesOrderDispatchAction.DISPATCH,
          // `CHK_sales_order_dispatch_events_shape` đòi `to_branch_id` với mọi
          // dòng `DISPATCH`; `from_branch_id` NULL vì lượt update chỉ thắng khi
          // đơn còn trong pool.
          fromBranchId: null,
          toBranchId: 'br-2',
          actorUserId: 'u-1',
          reason: null,
        },
      ]);
      // Ghi qua `manager` của CHÍNH transaction phân đơn — không phải một
      // repository, tức không phải một kết nối thứ hai: vết và `branch_id` cuộn
      // lại cùng nhau hoặc không cuộn cái nào.
      expect(manager.insert).toHaveBeenCalledTimes(1);
    });

    it('phân hai lần → lần hai 409 ORDER_ALREADY_DISPATCHED, không ghi đè, không vết thứ hai', async () => {
      const { service, updates, dispatchEvents } = build({ current: pooled });

      await service.dispatch('so-web', 'br-2', actor);
      await expect(service.dispatch('so-web', 'br-3', actor)).rejects.toMatchObject({
        response: { code: 'ORDER_ALREADY_DISPATCHED' },
      });

      // Chi nhánh giữ nguyên bên thắng; `br-3` không bao giờ được ghi.
      expect(updates).toEqual([{ branchId: 'br-2' }]);
      expect(dispatchEvents).toHaveLength(1);
      expect(dispatchEvents[0]).toMatchObject({ toBranchId: 'br-2' });
    });

    it('đơn không còn SENT → 409 ORDER_NOT_DISPATCHABLE, không ghi gì', async () => {
      const { service, updates, dispatchEvents } = build({
        current: { ...pooled, status: SalesOrderStatus.PROCESSED },
      });

      await expect(service.dispatch('so-web', 'br-2', actor)).rejects.toMatchObject({
        response: { code: 'ORDER_NOT_DISPATCHABLE' },
      });
      expect(updates).toHaveLength(0);
      expect(dispatchEvents).toHaveLength(0);
    });

    it('chi nhánh không thuộc tổ chức → 400, đơn ở nguyên trong pool', async () => {
      // `sales_orders.branch_id` không có FK: nếu service không kiểm, một id chi
      // nhánh của tổ chức khác sẽ được ghi và đơn biến mất khỏi mọi lưới.
      const { service, updates, dispatchEvents } = build({ current: pooled, branchExists: false });

      await expect(service.dispatch('so-web', 'br-khác-tổ-chức', actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(updates).toHaveLength(0);
      expect(dispatchEvents).toHaveLength(0);
    });

    /**
     * Nửa sau của điều phối: sau khi phân, đơn xuất hiện ở ĐÚNG chi nhánh và chỉ
     * ở đó (bước 6 của demo script).
     *
     * Thứ test này chứng minh được: `list()` cũ khoá theo `actor.branchId` và
     * theo không gì khác, nên đơn vừa phân cho `br-2` về với `br-2` và không có
     * đường nào lọt vào lượt đọc của `br-3`. Bộ giả LỌC theo đúng mệnh đề mà
     * service sinh ra, nên đây là phép kiểm về kết quả, không phải về câu SQL.
     *
     * Thứ nó KHÔNG chứng minh được, và phải nói ra: việc Postgres thi hành mệnh
     * đề ấy y như bộ giả. Bước 6 của demo là ca kiểm thật.
     */
    it('sau khi phân, chi nhánh ĐÚNG đọc được đơn; chi nhánh khác không', async () => {
      // Hàng `sales_orders` như nó tồn tại SAU lượt phân: `branch_id = br-2`,
      // trạng thái vẫn `SENT`.
      const afterDispatch = {
        ...pooled,
        branchId: 'br-2',
        documentNumber: 'DT000009',
        createdAt: new Date('2026-09-21T00:00:00Z'),
        customerId: null,
        customerName: null,
        customerPhone: null,
        subtotal: '1000000.00',
        discount: '0.00',
        amountDue: '1000000.00',
        note: null,
        rejectReason: null,
        cancelReason: null,
      };
      // Thu ngân (có quyền duyệt) thấy cả chi nhánh — đơn web không có
      // `salespersonId` nên vai tư vấn sẽ không đọc được nó.
      const { service } = build({ canApprove: true, current: pooled, rows: [afterDispatch] });

      await service.dispatch('so-web', 'br-2', actor);

      const atBranch = await service.list({}, { ...actor, branchId: 'br-2' });
      expect(atBranch.total).toBe(1);
      expect(atBranch.data[0].id).toBe('so-web');

      const elsewhere = await service.list({}, { ...actor, branchId: 'br-3' });
      expect(elsewhere.total).toBe(0);
      expect(elsewhere.data).toEqual([]);
    });
  });

  /**
   * Trả đơn về pool (AC-21, AC-22). Bốn luật không nhìn thấy được trên màn hình:
   * trạng thái KHÔNG đổi (chỉ `branch_id` rơi về NULL), lý do là bắt buộc vì DB
   * đòi, đơn đã sinh hoá đơn thì chặn hẳn, và một lần rời chi nhánh để lại đúng
   * một vết dù bấm bao nhiêu lần.
   */
  describe('returnToPool', () => {
    /** Đơn web đã được phân về `br-2`, chưa ai nhận xử lý. */
    const held = {
      id: 'so-web',
      status: SalesOrderStatus.SENT,
      branchId: 'br-2',
      salespersonId: null,
      salespersonName: null,
      salesChannel: 'Website công ty',
      invoiceId: null,
    };
    /** Người điều phối: có `pos.sales-order.dispatch`, thao tác trên đơn của mọi chi nhánh. */
    const dispatcher = { canDispatch: true };

    it('đơn đang ở chi nhánh → branch_id NULL, status VẪN SENT, một vết RETURN có lý do (AC-21)', async () => {
      const { service, updates, dispatchEvents, manager } = build({ ...dispatcher, current: held });

      const view = await service.returnToPool('so-web', '  Hết hàng tại chi nhánh  ', actor);

      // CHỈ `branch_id` đổi. Không có `status` trong patch: thêm một trạng thái
      // mới cho "đã bị trả về" là đúng thứ A-05 loại bỏ.
      expect(updates).toEqual([{ branchId: null }]);
      expect(view.status).toBe(SalesOrderStatus.SENT);
      expect(dispatchEvents).toEqual([
        {
          organizationId: 'org-1',
          salesOrderId: 'so-web',
          action: SalesOrderDispatchAction.RETURN,
          // `CHK_sales_order_dispatch_events_shape`: `RETURN` ĐÒI
          // `from_branch_id` + `reason`, và CẤM `to_branch_id`.
          fromBranchId: 'br-2',
          toBranchId: null,
          actorUserId: 'u-1',
          // Lý do đã cắt khoảng trắng — lịch sử điều phối không lưu lề.
          reason: 'Hết hàng tại chi nhánh',
        },
      ]);
      // Vết ghi qua `manager` của CHÍNH transaction: `branch_id` và dòng lịch sử
      // cuộn lại cùng nhau hoặc không cuộn cái nào.
      expect(manager.insert).toHaveBeenCalledTimes(1);
    });

    it('lý do rỗng (chỉ khoảng trắng) → 400, không ghi gì', async () => {
      const { service, updates, dispatchEvents, dataSource } = build({ ...dispatcher, current: held });

      await expect(service.returnToPool('so-web', '   ', actor)).rejects.toBeInstanceOf(BadRequestException);

      // Chặn TRƯỚC cả transaction: một dòng `RETURN` thiếu lý do bị chính DB từ
      // chối, nên để nó chạy tới đó là đổi 400 thành 500.
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(updates).toHaveLength(0);
      expect(dispatchEvents).toHaveLength(0);
    });

    it('đơn ĐÃ sinh hoá đơn → 409 ORDER_HAS_INVOICE, branch_id không đổi, không vết (AC-22)', async () => {
      // `invoice_id` chỉ do `approve()` ghi, cùng lượt với `PROCESSED`. Kiểm
      // RIÊNG nó chứ không chỉ kiểm trạng thái: hoá đơn là thứ không đảo được
      // bằng một lượt UPDATE, và người bấm phải thấy đúng lý do bị chặn.
      const { service, updates, dispatchEvents } = build({
        ...dispatcher,
        current: { ...held, status: SalesOrderStatus.PROCESSED, invoiceId: 'inv-1' },
      });

      await expect(service.returnToPool('so-web', 'Đổi ý', actor)).rejects.toMatchObject({
        response: { code: 'ORDER_HAS_INVOICE' },
      });
      expect(updates).toHaveLength(0);
      expect(dispatchEvents).toHaveLength(0);
    });

    it('đơn đã huỷ mà CHƯA có hoá đơn → 409 ORDER_NOT_DISPATCHABLE, không lẫn với ORDER_HAS_INVOICE', async () => {
      const { service, updates, dispatchEvents } = build({
        ...dispatcher,
        current: { ...held, status: SalesOrderStatus.CANCELLED },
      });

      await expect(service.returnToPool('so-web', 'Đổi ý', actor)).rejects.toMatchObject({
        response: { code: 'ORDER_NOT_DISPATCHABLE' },
      });
      expect(updates).toHaveLength(0);
      expect(dispatchEvents).toHaveLength(0);
    });

    it('đơn đang Ở POOL → 409 ORDER_NOT_DISPATCHED, không vết RETURN nào', async () => {
      // Không có chi nhánh nào để ghi vào `from_branch_id` ⇒ không có dòng
      // `RETURN` hợp lệ nào để ghi. Chặn ở service, không để CHECK của DB bắt.
      const { service, updates, dispatchEvents } = build({
        ...dispatcher,
        current: { ...held, branchId: null },
      });

      await expect(service.returnToPool('so-web', 'Trả lần nữa', actor)).rejects.toMatchObject({
        response: { code: 'ORDER_NOT_DISPATCHED' },
      });
      expect(updates).toHaveLength(0);
      expect(dispatchEvents).toHaveLength(0);
    });

    it('trả hai lần → lần hai 409, chỉ MỘT vết cho một lần rời chi nhánh', async () => {
      const { service, updates, dispatchEvents } = build({ ...dispatcher, current: held });

      await service.returnToPool('so-web', 'Hết hàng', actor);
      await expect(service.returnToPool('so-web', 'Hết hàng', actor)).rejects.toMatchObject({
        response: { code: 'ORDER_NOT_DISPATCHED' },
      });

      expect(updates).toEqual([{ branchId: null }]);
      expect(dispatchEvents).toHaveLength(1);
    });

    it('thu ngân chi nhánh KHÁC → 403 ORDER_NOT_HELD_BY_BRANCH, không ghi gì', async () => {
      // `canApprove` KHÔNG thay được `canDispatch`: thu ngân `br-1` đẩy được đơn
      // của `br-2` ra khỏi chi nhánh ấy là một cách phá việc của người khác.
      const { service, updates, dispatchEvents } = build({
        canApprove: true,
        canDispatch: false,
        current: held,
      });

      await expect(
        service.returnToPool('so-web', 'Không phải đơn của tôi', { ...actor, branchId: 'br-1' }),
      ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_HELD_BY_BRANCH' } });
      expect(updates).toHaveLength(0);
      expect(dispatchEvents).toHaveLength(0);
    });

    it('thu ngân của CHÍNH chi nhánh đang giữ đơn trả về được, vết ghi tên họ', async () => {
      const { service, updates, dispatchEvents } = build({
        canApprove: true,
        canDispatch: false,
        current: held,
      });

      await service.returnToPool('so-web', 'Khách đổi nơi nhận', {
        ...actor,
        userId: 'u-cashier',
        branchId: 'br-2',
      });

      expect(updates).toEqual([{ branchId: null }]);
      expect(dispatchEvents).toEqual([
        expect.objectContaining({
          action: SalesOrderDispatchAction.RETURN,
          fromBranchId: 'br-2',
          toBranchId: null,
          actorUserId: 'u-cashier',
          reason: 'Khách đổi nơi nhận',
        }),
      ]);
    });

    it('DTO: lý do toàn khoảng trắng hỏng validate, lý do thật thì về dạng đã cắt lề', async () => {
      // `@Transform` phải chạy TRƯỚC `@IsNotEmpty`: `"   "` là chuỗi KHÔNG rỗng
      // với class-validator, nên thiếu thứ tự ấy là một lý do trắng lọt xuống DB.
      const blank = plainToInstance(ReturnSalesOrderDto, { reason: '   ' });
      expect(await validate(blank)).not.toHaveLength(0);

      const ok = plainToInstance(ReturnSalesOrderDto, { reason: '  Hết hàng  ' });
      expect(await validate(ok)).toHaveLength(0);
      expect(ok.reason).toBe('Hết hàng');
    });

    it('đơn trả về rơi lại vào pool của lưới Admin, và biến mất khỏi lưới chi nhánh cũ', async () => {
      // Nửa sau của AC-21: sau lượt trả, `br-2` không còn thấy đơn, còn màn
      // Điều phối (`unassigned`) thấy lại nó. Bộ giả lọc theo đúng mệnh đề mà
      // service sinh ra, nên đây là phép kiểm về KẾT QUẢ.
      const afterReturn = {
        id: 'so-web',
        documentNumber: 'DT000009',
        status: SalesOrderStatus.SENT,
        createdAt: new Date('2026-09-21T00:00:00Z'),
        organizationId: 'org-1',
        branchId: null as string | null,
        salespersonId: null,
        salespersonName: null,
        salesChannel: 'Website công ty',
        customerId: null,
        customerName: null,
        customerPhone: null,
        subtotal: '1000000.00',
        discount: '0.00',
        amountDue: '1000000.00',
        note: null,
        rejectReason: null,
        cancelReason: null,
      };
      const { service } = build({
        canDispatch: true,
        canReadAll: true,
        canApprove: true,
        current: held,
        rows: [afterReturn],
      });

      await service.returnToPool('so-web', 'Hết hàng', actor);

      const pool = await service.listForOrganization({ unassigned: true }, actor);
      expect(pool.data.map((r) => [r.id, r.branchId, r.status])).toEqual([
        ['so-web', null, SalesOrderStatus.SENT],
      ]);

      const atOldBranch = await service.list({}, { ...actor, branchId: 'br-2' });
      expect(atOldBranch.total).toBe(0);
    });
  });

  /**
   * Đường đọc cấp tổ chức (ADR-07, A-09). Điểm đáng khoá: nó KHÔNG lọc chi
   * nhánh, nên quyền là thứ duy nhất giữ phạm vi — và hai phạm vi ấy là hai
   * quyền khác nhau.
   */
  describe('listForOrganization', () => {
    it('unassigned=true → pool branch_id IS NULL, không khoá theo chi nhánh của header', async () => {
      // Người điều phối KHÔNG có `read-all`: pool vẫn phải mở cho họ.
      const { service, listQb } = build({ canReadAll: false });

      await service.listForOrganization({ unassigned: true }, actor);

      expect(listQb.where).toHaveBeenCalledWith('so.organizationId = :org', { org: 'org-1' });
      expect(listQb.andWhere).toHaveBeenCalledWith('so.branchId IS NULL');
      // Đây là toàn bộ khác biệt với `list()` cũ — có mệnh đề này là rò phạm vi
      // ngược lại, không có nó mới đúng.
      expect(listQb.andWhere).not.toHaveBeenCalledWith('so.branchId = :branch', expect.anything());
      // Đơn lưu tạm là giỏ riêng của người gửi, không phạm vi nào lôi nó ra.
      expect(listQb.andWhere).toHaveBeenCalledWith('so.status <> :draft', { draft: SalesOrderStatus.DRAFT });
    });

    it('không unassigned mà thiếu read-all → 403, và không truy vấn nào chạy (AC-13)', async () => {
      // `canApprove: true` là chỗ có răng: quyền duyệt của thu ngân KHÔNG thay
      // được `read-all`, nếu không thì mọi thu ngân đọc được đơn toàn chuỗi.
      const { service, orders } = build({ canApprove: true, canReadAll: false });

      await expect(service.listForOrganization({}, actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(orders.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('có read-all → toàn chuỗi: không lọc chi nhánh, không lọc pool', async () => {
      const { service, listQb, rbac } = build({ canReadAll: true });

      await service.listForOrganization({ status: SalesOrderStatus.SENT }, actor);

      expect(rbac.hasPermission).toHaveBeenCalledWith('u-1', 'org-1', SALES_ORDER_PERMISSIONS.readAll);
      expect(listQb.andWhere).not.toHaveBeenCalledWith('so.branchId IS NULL');
      expect(listQb.andWhere).not.toHaveBeenCalledWith('so.branchId = :branch', expect.anything());
      expect(listQb.andWhere).toHaveBeenCalledWith('so.status = :status', { status: SalesOrderStatus.SENT });
    });

    /**
     * Ba đơn ở ba phạm vi (pool / HCM / chi nhánh kiểm thử) là đúng bộ dữ liệu
     * của Demo script UOW-03 bước 1–3.
     */
    const orgRow = (over: Record<string, unknown>) => ({
      id: 'so-x',
      documentNumber: 'DT000100',
      status: SalesOrderStatus.SENT,
      createdAt: new Date('2026-09-21T00:00:00Z'),
      organizationId: 'org-1',
      branchId: null as string | null,
      salespersonId: null,
      salespersonName: null,
      salesChannel: 'Website',
      customerId: null,
      customerName: null,
      customerPhone: null,
      subtotal: '1000000.00',
      discount: '0.00',
      amountDue: '1000000.00',
      shippingFee: '30000.00',
      note: null,
      rejectReason: null,
      cancelReason: null,
      ...over,
    });

    const HCM = { id: 'br-hcm', name: 'Hồ Chí Minh', organizationId: 'org-1' };
    const TEST_BRANCH = { id: 'br-test', name: 'Chi nhánh kiểm thử', organizationId: 'org-1' };
    const threeScopes = [
      orgRow({ id: 'so-pool', branchId: null }),
      orgRow({ id: 'so-hcm', branchId: 'br-hcm' }),
      orgRow({ id: 'so-test', branchId: 'br-test' }),
    ];

    it('mỗi dòng mang invoiceCode của hoá đơn đã tạo — MỘT lượt `IN`, đơn chưa duyệt trả null', async () => {
      const { service, invoices } = build({
        canReadAll: true,
        rows: [orgRow({ id: 'so-pool', branchId: null }), orgRow({ id: 'so-done', branchId: 'br-hcm', invoiceId: 'inv-9' })],
        branches: [HCM],
      });

      const res = await service.listForOrganization({}, actor);

      expect(res.data.map((r) => [r.id, r.invoiceCode])).toEqual([
        ['so-pool', null],
        ['so-done', 'HD-inv-9'],
      ]);
      expect(invoices.find).toHaveBeenCalledTimes(1);
      expect(invoices.find.mock.calls[0][0]).toMatchObject({ where: { organizationId: 'org-1' } });
      expect(invoices.findOne).not.toHaveBeenCalled();
    });

    it('toàn chuỗi: mỗi dòng mang branchName inline, đơn pool trả null (AC-14)', async () => {
      const { service, branchRepo, dataSource } = build({
        canReadAll: true,
        rows: threeScopes,
        branches: [HCM, TEST_BRANCH],
      });

      const res = await service.listForOrganization({}, actor);

      expect(res.total).toBe(3);
      // Tên gắn INLINE vào từng dòng, không phải root map `{[id]: name}` cạnh `data`.
      expect(res.data.map((r) => [r.id, r.branchId, r.branchName])).toEqual([
        ['so-pool', null, null],
        ['so-hcm', 'br-hcm', 'Hồ Chí Minh'],
        ['so-test', 'br-test', 'Chi nhánh kiểm thử'],
      ]);
      // Đơn pool phải là `null` — KHÔNG phải chuỗi rỗng: lưới hiển thị
      // "(Chưa phân)" dựa trên đúng chỗ này, và '' sẽ ra một ô trống câm lặng.
      expect(res.data[0].branchName).toBeNull();
      expect(res.data[0].branchName).not.toBe('');

      // MỘT lượt đọc `branches` cho cả trang, không phải mỗi dòng một lượt.
      expect(dataSource.getRepository).toHaveBeenCalledWith(BranchEntity);
      expect(branchRepo.find).toHaveBeenCalledTimes(1);
      expect(branchRepo.find.mock.calls[0][0]).toMatchObject({ where: { organizationId: 'org-1' } });

      // `numeric` về từ TypeORM là CHUỖI dù khai `number` — dòng nào cũng phải
      // đã ép, nếu không thì `shippingFee + amountDue` ở client là nối chuỗi.
      expect(typeof res.data[0].amountDue).toBe('number');
      expect(typeof res.data[0].shippingFee).toBe('number');
      expect(res.data[0].shippingFee).toBe(30000);
    });

    it('lọc chi nhánh: UNASSIGNED ra đúng pool, uuid ra đúng chi nhánh ấy (AC-15)', async () => {
      const pool = build({ canReadAll: true, rows: threeScopes, branches: [HCM, TEST_BRANCH] });

      const unassigned = await pool.service.listForOrganization(
        { branchId: UNASSIGNED_BRANCH_FILTER },
        actor,
      );

      expect(pool.listQb.andWhere).toHaveBeenCalledWith('so.branchId IS NULL');
      expect(unassigned.total).toBe(1);
      expect(unassigned.data.map((r) => r.id)).toEqual(['so-pool']);
      expect(unassigned.data[0].branchName).toBeNull();
      // Cả trang là đơn pool ⇒ không có id nào để tra ⇒ không chạm `branches`.
      expect(pool.branchRepo.find).not.toHaveBeenCalled();

      const byBranch = build({ canReadAll: true, rows: threeScopes, branches: [HCM, TEST_BRANCH] });

      const onlyHcm = await byBranch.service.listForOrganization({ branchId: 'br-hcm' }, actor);

      expect(byBranch.listQb.andWhere).toHaveBeenCalledWith('so.branchId = :branchFilter', {
        branchFilter: 'br-hcm',
      });
      expect(onlyHcm.total).toBe(1);
      expect(onlyHcm.data.map((r) => [r.id, r.branchName])).toEqual([['so-hcm', 'Hồ Chí Minh']]);
      // Lọc về một chi nhánh KHÔNG được biến thành mệnh đề pool.
      expect(byBranch.listQb.andWhere).not.toHaveBeenCalledWith('so.branchId IS NULL');
    });

    it('đơn của tổ chức khác không lọt vào kết quả, và tên chi nhánh org khác không rò', async () => {
      // Hai cửa rò khác nhau, cùng một gốc là `branch_id` không có FK:
      // 1. `so-other-org` thuộc org-2 — mệnh đề `organizationId` phải cắt nó;
      // 2. `so-stray` thuộc org-1 nhưng trỏ vào chi nhánh CỦA org-2 — dòng vẫn
      //    hiện (nó là đơn của mình) nhưng KHÔNG được mang tên của org kia.
      const foreign = { id: 'br-other', name: 'Kho org khác', organizationId: 'org-2' };
      const { service, branchRepo } = build({
        canReadAll: true,
        rows: [
          orgRow({ id: 'so-hcm', branchId: 'br-hcm' }),
          orgRow({ id: 'so-other-org', organizationId: 'org-2', branchId: 'br-other' }),
          orgRow({ id: 'so-stray', branchId: 'br-other' }),
        ],
        branches: [HCM, foreign],
      });

      const res = await service.listForOrganization({}, actor);

      expect(res.data.map((r) => r.id)).toEqual(['so-hcm', 'so-stray']);
      expect(res.data.map((r) => r.id)).not.toContain('so-other-org');
      expect(res.data[1]).toMatchObject({ branchId: 'br-other', branchName: null });
      // Lượt tra tên cũng phải khoá tổ chức — nếu bỏ `organizationId` ở đó thì
      // `so-stray` sẽ khoe tên "Kho org khác" cho Admin của org-1.
      expect(branchRepo.find.mock.calls[0][0]).toMatchObject({ where: { organizationId: 'org-1' } });
    });

    it('chi nhánh đã bị xoá: dòng VẪN hiện, giữ branchId, branchName null', async () => {
      // `sales_orders.branch_id` là varchar không FK, nên xoá một chi nhánh để
      // lại đúng trạng thái này. Một `INNER JOIN` sẽ làm đơn biến mất khỏi lưới
      // — hỏng im lặng, và đó là lý do tên được tra bằng lượt đọc riêng.
      const { service } = build({
        canReadAll: true,
        rows: [orgRow({ id: 'so-orphan', branchId: 'br-gone' }), orgRow({ id: 'so-hcm', branchId: 'br-hcm' })],
        branches: [HCM],
      });

      const res = await service.listForOrganization({}, actor);

      expect(res.total).toBe(2);
      expect(res.data.map((r) => r.id)).toContain('so-orphan');
      expect(res.data[0]).toMatchObject({ id: 'so-orphan', branchId: 'br-gone', branchName: null });
      // Chi nhánh còn sống bên cạnh vẫn ra tên — một id hỏng không kéo cả trang xuống.
      expect(res.data[1]).toMatchObject({ id: 'so-hcm', branchName: 'Hồ Chí Minh' });
    });
  });

  /**
   * Bài học T-01-03, đóng lại bằng một phép kiểm: quyền được khai báo là chưa
   * đủ — route phải THẬT SỰ gắn đúng khoá, không thì "403 với mọi người" và
   * "403 với đúng người" trông giống hệt nhau từ ngoài.
   */
  describe('AdminSalesOrderController — quyền gắn trên route', () => {
    it('dispatch đòi đúng pos.sales-order.dispatch', () => {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AdminSalesOrderController.prototype.dispatch)).toBe(
        'pos.sales-order.dispatch',
      );
    });

    it('list đòi dispatch HOẶC read-all (mảng = OR ở PermissionGuard)', () => {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AdminSalesOrderController.prototype.list)).toEqual([
        'pos.sales-order.dispatch',
        'pos.sales-order.read-all',
      ]);
    });

    it('không dùng lại quyền duyệt của thu ngân (A-08)', () => {
      expect(SALES_ORDER_PERMISSIONS.dispatch).not.toBe(SALES_ORDER_PERMISSIONS.approve);
      expect(SALES_ORDER_PERMISSIONS.readAll).not.toBe(SALES_ORDER_PERMISSIONS.read);
    });

    /**
     * AC-13, chạy THẬT chứ không suy ra từ metadata.
     *
     * `PermissionGuard` thật + `Reflector` thật + đúng bộ khoá mà seed cấp cho
     * vai được kiểm; handler chỉ được gọi khi guard cho qua, đúng thứ tự Nest
     * chạy. Đó là khác biệt với T-01-03: ở đó quyền có khai báo, route có gắn,
     * và endpoint vẫn 403 với TẤT CẢ mọi người vì không vai nào cầm khoá. Ca
     * dương dưới đây là thứ duy nhất bắt được lỗi ấy ở tầng unit.
     */
    function pipeline(
      heldKeys: readonly string[],
      handler: (...args: never[]) => unknown = AdminSalesOrderController.prototype.dispatch,
    ) {
      const guard = new PermissionGuard(new Reflector(), {
        hasAnyPermission: jest.fn(async (_u: string, _o: string, keys: string[]) =>
          keys.some((key) => heldKeys.includes(key)),
        ),
      } as never);
      const context = {
        getHandler: () => handler,
        getClass: () => AdminSalesOrderController,
        switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u-1', organizationId: 'org-1' } }) }),
      } as never;
      return { guard, context };
    }

    it('tài khoản thu ngân gọi thẳng API → 403, branch_id KHÔNG đổi (AC-13)', async () => {
      const { service, updates, dispatchEvents } = build({
        current: { id: 'so-web', status: SalesOrderStatus.SENT, branchId: null },
      });
      const controller = new AdminSalesOrderController(service);
      const { guard, context } = pipeline(CASHIER_PERMISSION_KEYS);

      let denied: unknown;
      const allowed = await guard.canActivate(context).catch((err: unknown) => {
        denied = err;
        return false;
      });
      // Nest chỉ gọi handler khi guard cho qua — mô phỏng đúng thứ tự đó.
      if (allowed) await controller.dispatch('so-web', { branchId: 'br-2' }, actor);

      expect(denied).toBeInstanceOf(ForbiddenException);
      expect(updates).toEqual([]);
      expect(dispatchEvents).toEqual([]);
    });

    it('tài khoản CÓ quyền điều phối đi lọt và phân được đơn (endpoint không chết như T-01-03)', async () => {
      const { service, updates } = build({
        current: { id: 'so-web', status: SalesOrderStatus.SENT, branchId: null },
      });
      const controller = new AdminSalesOrderController(service);
      const { guard, context } = pipeline(SYSTEM_ADMIN_PERMISSION_KEYS);

      const allowed = await guard.canActivate(context);
      expect(allowed).toBe(true);

      await controller.dispatch('so-web', { branchId: 'br-2' }, actor);
      expect(updates).toEqual([{ branchId: 'br-2' }]);
    });

    it('return đòi dispatch HOẶC approve — không có khoá quyền MỚI nào ra đời', () => {
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AdminSalesOrderController.prototype.returnToPool),
      ).toEqual(['pos.sales-order.dispatch', 'pos.sales-order.approve']);
      // Cả hai khoá đã nằm trong seed vai trò: `dispatch` ở
      // `SYSTEM_ADMIN_PERMISSION_KEYS`, `approve` ở `CASHIER_PERMISSION_KEYS`.
      // Một khoá thứ ba ở đây là một route 403 với TẤT CẢ mọi người (T-01-03).
      expect(SYSTEM_ADMIN_PERMISSION_KEYS).toContain('pos.sales-order.dispatch');
      expect(CASHIER_PERMISSION_KEYS).toContain('pos.sales-order.approve');
    });

    it('thu ngân QUA được guard của return, rồi bị service chặn theo chi nhánh của đơn', async () => {
      // Hai tầng, hai việc khác nhau: guard chỉ hỏi "có khoá nào không", còn
      // "đơn này có phải của chi nhánh anh không" phụ thuộc `branch_id` của
      // chính đơn — thứ decorator không đọc được.
      const { service, updates, dispatchEvents } = build({
        canApprove: true,
        canDispatch: false,
        current: { id: 'so-web', status: SalesOrderStatus.SENT, branchId: 'br-2', invoiceId: null },
      });
      const controller = new AdminSalesOrderController(service);
      const { guard, context } = pipeline(
        CASHIER_PERMISSION_KEYS,
        AdminSalesOrderController.prototype.returnToPool,
      );

      expect(await guard.canActivate(context)).toBe(true);

      await expect(
        controller.returnToPool('so-web', { reason: 'Không phải đơn của tôi' }, { ...actor, branchId: 'br-1' }),
      ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_HELD_BY_BRANCH' } });
      expect(updates).toEqual([]);
      expect(dispatchEvents).toEqual([]);
    });
  });
});

/**
 * Đường ĐỐI TÁC (`createFromPartner`) — năm luật của T-01-04, không luật nào
 * nhìn thấy được trên màn hình: đơn rơi vào pool chưa phân, gửi lại không đẻ đơn
 * thứ hai, SĐT khác định dạng vẫn là một khách, giá đã chốt thì không đổi theo
 * bảng giá, và không có dòng giảm giá nào.
 *
 * Bộ giả ở đây mô phỏng cả RÀNG BUỘC của DB (UNIQUE `(org, channel,
 * external_order_id)` ném 23505) chứ không chỉ các lời gọi — đó là thứ duy nhất
 * làm nhánh replay chạy thật trong unit test.
 */
describe('SalesOrderService.createFromPartner', () => {
  /** API key là danh tính của WEBSITE (A-10): không chi nhánh, không hồ sơ nhân viên. */
  const partnerActor = { userId: 'key-user', organizationId: 'org-1', roles: [] as string[] };

  const webChannel = { id: 'ch-web', code: 'WEB', name: 'Website công ty', isActive: true } as SalesChannelEntity;

  function partnerDto(overrides: Partial<PartnerCreateOrderDto> = {}): PartnerCreateOrderDto {
    return {
      externalOrderId: 'WEB-1001',
      customer: { name: 'Trần Bảo Ngọc', phone: '0901234567' },
      recipient: { name: 'Trần Bảo Ngọc', phone: '0901234567' },
      shipping: { provinceCode: '79', wardCode: '26734', addressLine: '12 Nguyễn Huệ', fee: 30000 },
      lines: [{ itemCode: 'SKU-500', quantity: 2 }],
      ...overrides,
    } as PartnerCreateOrderDto;
  }

  function buildPartner({
    catalog = { 'i-500': { id: 'i-500', code: 'SKU-500', name: 'Ghế gỗ', unit: 'Cái', sellingPrice: 500000 } } as Record<
      string,
      { id: string; code: string; name: string; unit: string; sellingPrice: number }
    >,
  }: {
    catalog?: Record<string, { id: string; code: string; name: string; unit: string; sellingPrice: number }>;
  } = {}) {
    const orderRows: Record<string, any>[] = [];
    const lineRows: Record<string, any>[] = [];
    const customerRows: Record<string, any>[] = [];

    const manager = {
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => data),
      save: jest.fn(async (entity: unknown, data: any) => {
        if (entity === SalesOrderLineEntity) {
          for (const line of data as Record<string, any>[]) lineRows.push({ ...line });
          return data;
        }
        // UNIQUE (organization_id, sales_channel_id, external_order_id) WHERE
        // external_order_id IS NOT NULL — bản giả của index thật trong DB.
        const clash =
          data.externalOrderId != null &&
          orderRows.some(
            (o) =>
              o.organizationId === data.organizationId &&
              o.salesChannelId === data.salesChannelId &&
              o.externalOrderId === data.externalOrderId,
          );
        if (clash) {
          const error: any = new Error('duplicate key value violates unique constraint "UQ_sales_orders_org_channel_external"');
          error.code = '23505';
          throw error;
        }
        const row = { ...data, id: `so-${orderRows.length + 1}` };
        orderRows.push(row);
        return row;
      }),
    };

    const orders = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        orderRows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
      ),
    };
    const lines = {
      find: jest.fn(async ({ where }: { where: { salesOrderId: string } }) =>
        lineRows.filter((row) => row.salesOrderId === where.salesOrderId),
      ),
    };
    const customers = {
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        customerRows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
      ),
      create: jest.fn((data: Record<string, unknown>) => data),
      save: jest.fn(async (data: Record<string, unknown>) => {
        const row = { ...data, id: `cus-${customerRows.length + 1}` };
        customerRows.push(row);
        return row;
      }),
    };
    // Đối tác tra hàng theo MÃ (T-01-08): `find({ where: { code: In(codes) } })`, so khớp đúng từng ký tự.
    const items = {
      find: jest.fn(async ({ where }: { where: { code: { _value: string[] } } }) =>
        (where.code as any)._value
          .map((code: string) => Object.values(catalog).find((it) => it.code === code))
          .filter(Boolean),
      ),
    };
    const dataSource = { transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)) };
    const numbering = {
      generate: jest.fn(async (type: DocumentType) =>
        type === DocumentType.CUSTOMER ? `KH00000${customerRows.length + 1}` : `DT00000${orderRows.length + 1}`,
      ),
    };

    const service = new SalesOrderService(
      orders as never,
      lines as never,
      { findOne: jest.fn(async () => null) } as never,
      customers as never,
      items as never,
      { findOne: jest.fn(async () => null) } as never,
      dataSource as never,
      numbering as never,
      { hasPermission: jest.fn(async () => false) } as never,
      { createDraftIn: jest.fn() } as never,
      { findOpenForBranch: jest.fn() } as never,
      { applyRedemptionIn: jest.fn() } as never,
      { cancel: jest.fn() } as never,
    );

    return { service, orderRows, lineRows, customerRows, catalog, numbering };
  }

  it('đơn web rơi vào POOL: branch_id và salesperson_id NULL, status SENT', async () => {
    const { service, orderRows } = buildPartner();

    const result = await service.createFromPartner(partnerDto(), webChannel, partnerActor, {
      provinceName: 'Thành phố Hồ Chí Minh',
      wardName: 'Phường Bến Nghé',
    });

    expect(orderRows).toHaveLength(1);
    const [order] = orderRows;
    // `undefined` ở tầng entity = cột không được ghi = NULL trong DB; đó là pool.
    expect(order.branchId ?? null).toBeNull();
    expect(order.salespersonId).toBeNull();
    expect(order.salespersonName).toBeNull();
    expect(order.status).toBe(SalesOrderStatus.SENT);
    // Nguồn đơn: id kênh để lọc, NHÃN kênh là snapshot chốt trên chứng từ (ADR-03).
    expect(order).toMatchObject({
      salesChannelId: 'ch-web',
      salesChannel: 'Website công ty',
      externalOrderId: 'WEB-1001',
      shippingFee: '30000',
      recipientName: 'Trần Bảo Ngọc',
      shipProvinceCode: '79',
      shipProvinceName: 'Thành phố Hồ Chí Minh',
      shipWardCode: '26734',
      shipWardName: 'Phường Bến Nghé',
      shipAddressLine: '12 Nguyễn Huệ',
    });
    expect(result).toMatchObject({ documentNumber: 'DT000001', status: SalesOrderStatus.SENT, amountDue: 1000000, shippingFee: 30000, replayed: false });
    // Phí giao KHÔNG cộng vào tiền hàng phải thu của đơn.
    expect(result.amountDue).toBe(1000000);
  });

  it('gửi lại cùng externalOrderId → MỘT đơn, lần hai trả về đơn cũ', async () => {
    const { service, orderRows } = buildPartner();

    const first = await service.createFromPartner(partnerDto(), webChannel, partnerActor);
    const second = await service.createFromPartner(partnerDto(), webChannel, partnerActor);

    expect(orderRows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.documentNumber).toBe(first.documentNumber);
    // Cờ để controller đáp 200 thay vì 201.
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    // Đơn cũ trả về KÈM dòng hàng, đọc lại từ bảng dòng.
    expect(second.lines).toEqual(first.lines);
  });

  it('SĐT `+84901234567` và `0901234567` khớp về CÙNG một khách', async () => {
    const { service, customerRows, orderRows } = buildPartner();

    await service.createFromPartner(
      partnerDto({ externalOrderId: 'WEB-1', customer: { name: 'Trần Bảo Ngọc', phone: '+84 901 234 567' } as any }),
      webChannel,
      partnerActor,
    );
    await service.createFromPartner(
      partnerDto({ externalOrderId: 'WEB-2', customer: { name: 'Ngọc (web)', phone: '0901234567' } as any }),
      webChannel,
      partnerActor,
    );

    expect(customerRows).toHaveLength(1);
    expect(customerRows[0].phone).toBe('0901234567');
    expect(orderRows[0].customerId).toBe(customerRows[0].id);
    expect(orderRows[1].customerId).toBe(customerRows[0].id);
    // Lượt thứ hai KHÔNG tạo khách mới nên cũng không xin mã khách mới.
    expect(customerRows[0].code).toBe('KH000001');
  });

  it('chuẩn hoá SĐT: mọi cách viết mã quốc gia về cùng một chuỗi', () => {
    expect(normalizePartnerPhone('+84901234567')).toBe('0901234567');
    expect(normalizePartnerPhone('84901234567')).toBe('0901234567');
    expect(normalizePartnerPhone('0901234567')).toBe('0901234567');
    expect(normalizePartnerPhone(' 090 123 45.67 ')).toBe('0901234567');
    expect(normalizePartnerPhone('+84 (0) 901234567')).toBe('0901234567');
  });

  it('selling_price đổi SAU khi đặt → dòng hàng của đơn cũ không đổi giá', async () => {
    const { service, catalog, lineRows } = buildPartner();

    const created = await service.createFromPartner(partnerDto(), webChannel, partnerActor);
    expect(created.lines[0]).toMatchObject({ itemCode: 'SKU-500', quantity: 2, unitPrice: 500000, lineTotal: 1000000 });

    // Bảng giá đổi sau khi đơn đã nhận.
    catalog['i-500'].sellingPrice = 600000;

    // Dòng đã ghi giữ nguyên giá đã chốt…
    expect(lineRows[0]).toMatchObject({ unitPrice: '500000', lineTotal: '1000000' });
    // …và đường đọc lại (replay) cũng trả đúng giá cũ, không đọc lại bảng giá.
    const replay = await service.createFromPartner(partnerDto(), webChannel, partnerActor);
    expect(replay.replayed).toBe(true);
    expect(replay.lines[0].unitPrice).toBe(500000);
    // Đơn MỚI thì mới ăn giá mới — chứng minh giá là snapshot, không phải cache.
    const later = await service.createFromPartner(partnerDto({ externalOrderId: 'WEB-1002' }), webChannel, partnerActor);
    expect(later.lines[0].unitPrice).toBe(600000);
  });

  it('CTKM toàn chuỗi đang bật vẫn KHÔNG sinh dòng giảm giá nào', async () => {
    // Thứ test này chứng minh được: đường partner tính tổng CHỈ từ giá niêm yết
    // và số lượng — `discount` của đơn và mọi khoản giảm của dòng là 0, và
    // `amountDue` đúng bằng `subtotal`.
    //
    // Thứ nó KHÔNG chứng minh được, và phải nói ra: ở đây không có CTKM nào
    // "đang bật" để bỏ qua — `SalesOrderService` không nhận `PromotionApplyService`
    // hay `QueryBus` trong constructor, nên nó không có cách nào gọi engine. Ca
    // "CTKM toàn chuỗi bật, đơn web vẫn 0 đồng giảm" cần một lượt gọi API thật
    // với một chương trình đang chạy (ghi ở `07-verification.md`).
    const { service, orderRows, lineRows } = buildPartner();

    const result = await service.createFromPartner(partnerDto(), webChannel, partnerActor);

    expect(orderRows[0]).toMatchObject({ subtotal: '1000000', discount: '0', amountDue: '1000000' });
    expect(lineRows[0]).toMatchObject({ promotionDiscount: '0', promotionName: null, manualDiscount: '0', manualDiscountReason: null });
    expect(result.amountDue).toBe(1000000);
  });

  it('kênh đã ngừng hoạt động → 403 CHANNEL_INACTIVE, không ghi gì', async () => {
    const { service, orderRows, customerRows } = buildPartner();

    await expect(
      service.createFromPartner(partnerDto(), { ...webChannel, isActive: false } as SalesChannelEntity, partnerActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orderRows).toHaveLength(0);
    expect(customerRows).toHaveLength(0);
  });

  it('itemCode không thuộc tổ chức → 400 ORDER_LINE_ITEM_UNKNOWN kèm đúng MÃ, không ghi gì', async () => {
    const { service, orderRows, customerRows } = buildPartner();

    await expect(
      service.createFromPartner(partnerDto({ lines: [{ itemCode: 'SKU-LẠ', quantity: 1 }] }), webChannel, partnerActor),
    ).rejects.toMatchObject({ response: { code: 'ORDER_LINE_ITEM_UNKNOWN', message: expect.stringContaining('SKU-LẠ') } });
    // Kiểm hàng hoá chạy TRƯỚC khi chạm tới khách — đơn hỏng không để lại khách mới.
    expect(orderRows).toHaveLength(0);
    expect(customerRows).toHaveLength(0);
  });

  it('itemCode so khớp đúng từng ký tự (T-01-08): "sku-500" KHÔNG phải "SKU-500"; khoảng trắng hai đầu được bỏ', async () => {
    const { service, orderRows } = buildPartner();

    await expect(
      service.createFromPartner(partnerDto({ lines: [{ itemCode: 'sku-500', quantity: 1 }] }), webChannel, partnerActor),
    ).rejects.toMatchObject({ response: { code: 'ORDER_LINE_ITEM_UNKNOWN' } });
    expect(orderRows).toHaveLength(0);

    const created = await service.createFromPartner(
      partnerDto({ externalOrderId: 'WEB-TRIM', lines: [{ itemCode: '  SKU-500 ', quantity: 1 }] }),
      webChannel,
      partnerActor,
    );
    // Dòng mang `items.id` thật — đối tác gửi mã, hệ thống vẫn ghi UUID lên dòng.
    expect(created.lines[0]).toMatchObject({ itemId: 'i-500', itemCode: 'SKU-500', unitPrice: 500000 });
  });
});
