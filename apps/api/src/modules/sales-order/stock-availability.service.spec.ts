import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DataSource, EntityManager, FindOperator } from 'typeorm';
import {
  CASHIER_PERMISSION_KEYS,
  SALES_PERMISSION_KEYS,
} from '../../database/seeds/org-role-permissions';
import type { ActorContext } from '../../common/decorators/actor-context.decorator';
import { REQUIRE_BRANCH_SCOPE_KEY, REQUIRE_PERMISSION_KEY } from '../auth/decorators';
import { StockBalanceEntity } from '../inventory/ledger/stock-balance.entity';
import { BranchScopeGuard } from '../rbac/branch-scope.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { AdminSalesOrderController } from './controllers/admin-sales-order.controller';
import { BranchStockCheckRequestDto, StockCheckDto } from './dto/stock-check.dto';
import { SalesOrderEntity } from './entities/sales-order.entity';
import { SalesOrderController } from './sales-order.controller';
import type { SalesOrderService } from './sales-order.service';
import { StockAvailabilityService } from './stock-availability.service';

/**
 * Hàng `stock_balances` giả — mỗi hàng là một (item, vị trí) của một chi nhánh.
 * `quantity` là CHUỖI như Postgres trả cột numeric.
 */
interface BalanceRow {
  organizationId: string;
  branchId: string;
  itemId: string;
  quantity: string;
}

/**
 * SUM là việc của DB, nên bản giả của query builder phải TỰ tính: nó đọc đúng
 * các tham số service truyền vào `where`/`andWhere`, lọc {@link BalanceRow} rồi
 * cộng theo `itemId`. Nhờ vậy "quên khoá tổ chức" hay "quên lọc chi nhánh" làm
 * con số sai thật, không phải một hằng số dựng sẵn vẫn xanh.
 */
function fakeManager(rows: BalanceRow[]) {
  const params: Record<string, unknown> = {};
  const clauses: string[] = [];
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    where: jest.fn((clause: string, p?: Record<string, unknown>) => {
      clauses.push(clause);
      Object.assign(params, p);
      return qb;
    }),
    andWhere: jest.fn((clause: string, p?: Record<string, unknown>) => {
      clauses.push(clause);
      Object.assign(params, p);
      return qb;
    }),
    getRawMany: jest.fn(async () => {
      const ids = params.itemIds as string[];
      const totals = new Map<string, number>();
      for (const r of rows) {
        if (r.organizationId !== params.organizationId) continue;
        if (!ids.includes(r.itemId)) continue;
        if ('branchId' in params && r.branchId !== params.branchId) continue;
        totals.set(r.itemId, (totals.get(r.itemId) ?? 0) + Number(r.quantity));
      }
      // Như Postgres: SUM(numeric) về dạng chuỗi.
      return [...totals].map(([itemId, total]) => ({ itemId, total: String(total) }));
    }),
  };
  const manager = {
    // Mỗi lượt `forItems` dựng query builder MỚI — tham số lượt trước (vd.
    // `branchId`) không được rò sang lượt sau.
    createQueryBuilder: jest.fn(() => {
      for (const key of Object.keys(params)) delete params[key];
      clauses.length = 0;
      return qb;
    }),
  };
  return { manager, qb, params, clauses };
}

interface OrderRow {
  id: string;
  organizationId: string;
  documentNumber: string;
  /** Chi nhánh đang giữ đơn; vắng = pool. */
  branchId?: string | null;
}

interface LineRow {
  salesOrderId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: string;
}

/**
 * Bản giả cho `checkOrders`: {@link fakeManager} (tồn) cộng `find` đọc đúng
 * điều kiện `where` service truyền vào — `In(...)` và khoá tổ chức — trên hai
 * bảng giả `sales_orders` / `sales_order_lines`.
 */
function fakeOrderManager(balances: BalanceRow[], orders: OrderRow[], lines: LineRow[]) {
  const fake = fakeManager(balances);
  const inValues = (v: unknown) => (v as FindOperator<string[]>).value as unknown as string[];
  const find = jest.fn(async (entity: unknown, opts: { where: Record<string, unknown> }) => {
    if (entity === SalesOrderEntity) {
      const ids = inValues(opts.where.id);
      return orders.filter(
        (o) =>
          ids.includes(o.id) &&
          o.organizationId === opts.where.organizationId &&
          (!('branchId' in opts.where) || (o.branchId ?? null) === opts.where.branchId),
      );
    }
    const orderIds = inValues(opts.where.salesOrderId);
    return lines.filter((l) => orderIds.includes(l.salesOrderId));
  });
  const manager = Object.assign(fake.manager, { find });
  const dataSource = { manager } as unknown as DataSource;
  return { service: new StockAvailabilityService(dataSource), ...fake, manager, find };
}

function line(salesOrderId: string, itemId: string, itemCode: string, quantity: string): LineRow {
  return { salesOrderId, itemId, itemCode, itemName: `Tên ${itemCode}`, quantity };
}

describe('StockAvailabilityService', () => {
  const rows: BalanceRow[] = [
    { organizationId: 'org-1', branchId: 'br-1', itemId: 'item-a', quantity: '3.00' },
    { organizationId: 'org-1', branchId: 'br-2', itemId: 'item-a', quantity: '4.50' },
    { organizationId: 'org-1', branchId: 'br-1', itemId: 'item-neg', quantity: '5' },
    { organizationId: 'org-1', branchId: 'br-2', itemId: 'item-neg', quantity: '-2' },
    // Cùng `itemId` nhưng tổ chức khác — tuyệt đối không được cộng vào org-1.
    { organizationId: 'org-2', branchId: 'br-9', itemId: 'item-a', quantity: '100' },
  ];

  function build() {
    const fake = fakeManager(rows);
    const dataSource = { manager: fake.manager } as unknown as DataSource;
    return { service: new StockAvailabilityService(dataSource), ...fake };
  }

  it('toàn chuỗi: cộng tồn rải trên hai chi nhánh', async () => {
    const { service } = build();

    const result = await service.forItems('org-1', ['item-a']);

    expect(result.get('item-a')).toBe(7.5);
  });

  it('lọc theo một chi nhánh chỉ cộng tồn của chi nhánh đó', async () => {
    const { service, clauses, params } = build();

    const result = await service.forItems('org-1', ['item-a'], 'br-2');

    expect(result.get('item-a')).toBe(4.5);
    expect(clauses).toContain('sb.branchId = :branchId');
    expect(params.branchId).toBe('br-2');
  });

  it('không có chi nhánh thì KHÔNG thêm điều kiện branch', async () => {
    const { service, clauses } = build();

    await service.forItems('org-1', ['item-a']);

    expect(clauses.some((c) => c.includes('branchId'))).toBe(false);
  });

  it('item không có dòng balance nào = 0, vẫn có mặt trong map', async () => {
    const { service } = build();

    const result = await service.forItems('org-1', ['item-a', 'item-none']);

    expect(result.has('item-none')).toBe(true);
    expect(result.get('item-none')).toBe(0);
    expect(result.size).toBe(2);
  });

  it('số âm cộng nguyên, không bị kẹp về 0 (A-34)', async () => {
    const { service } = build();

    const result = await service.forItems('org-1', ['item-neg']);

    expect(result.get('item-neg')).toBe(3);
  });

  it('trả number chứ không trả chuỗi numeric', async () => {
    const { service } = build();

    const result = await service.forItems('org-1', ['item-a']);

    expect(typeof result.get('item-a')).toBe('number');
  });

  it('luôn khoá organization_id — không đọc stock_balances của tổ chức khác', async () => {
    const { service, qb, params } = build();

    const result = await service.forItems('org-1', ['item-a']);

    expect(qb.where).toHaveBeenCalledWith('sb.organizationId = :organizationId', {
      organizationId: 'org-1',
    });
    expect(params.organizationId).toBe('org-1');
    // 100 của org-2 mà lọt vào thì con số sẽ là 107.5.
    expect(result.get('item-a')).toBe(7.5);
  });

  it('tổ chức khác chỉ thấy tồn của chính nó', async () => {
    const { service } = build();

    const result = await service.forItems('org-2', ['item-a', 'item-neg']);

    expect(result.get('item-a')).toBe(100);
    expect(result.get('item-neg')).toBe(0);
  });

  it('itemIds rỗng trả map rỗng và không chạm DB', async () => {
    const { service, manager } = build();

    const result = await service.forItems('org-1', []);

    expect(result.size).toBe(0);
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('có manager thì chạy bằng manager đó (trong transaction bên gọi), không dùng dataSource', async () => {
    const { service, manager: dsManager } = build();
    const tx = fakeManager(rows);

    const result = await service.forItems('org-1', ['item-a'], undefined, tx.manager as unknown as EntityManager);

    expect(tx.manager.createQueryBuilder).toHaveBeenCalledWith(StockBalanceEntity, 'sb');
    expect(dsManager.createQueryBuilder).not.toHaveBeenCalled();
    expect(result.get('item-a')).toBe(7.5);
  });
});

/**
 * Fixture của demo UOW-09 / AC-31 / AC-43: `SKU-500` = 1 ở CN-A + 1 ở CN-B,
 * `SKU-900` = 0 (không có dòng balance nào).
 */
describe('StockAvailabilityService.checkOrders', () => {
  const balances: BalanceRow[] = [
    { organizationId: 'org-1', branchId: 'cn-a', itemId: 'item-500', quantity: '1' },
    { organizationId: 'org-1', branchId: 'cn-b', itemId: 'item-500', quantity: '1' },
    { organizationId: 'org-2', branchId: 'cn-z', itemId: 'item-900', quantity: '50' },
  ];

  it('AC-31: toàn chuỗi xếp X, Y, Z — đủ trước, thiếu sau, hoà thì theo mã đơn', async () => {
    // Mã đơn cố ý KHÔNG theo thứ tự X, Y, Z: X xếp đầu nhờ đủ hàng, không nhờ mã.
    const orders: OrderRow[] = [
      { id: 'x', organizationId: 'org-1', documentNumber: 'SO-0003' },
      { id: 'y', organizationId: 'org-1', documentNumber: 'SO-0001' },
      { id: 'z', organizationId: 'org-1', documentNumber: 'SO-0002' },
    ];
    const lines = [
      line('x', 'item-500', 'SKU-500', '1'),
      line('y', 'item-500', 'SKU-500', '3'),
      line('z', 'item-500', 'SKU-500', '1'),
      line('z', 'item-900', 'SKU-900', '2'),
    ];
    const { service, manager, clauses } = fakeOrderManager(balances, orders, lines);

    const result = await service.checkOrders('org-1', [{ orderId: 'z' }, { orderId: 'y' }, { orderId: 'x' }]);

    expect(result.map((o) => o.orderId)).toEqual(['x', 'y', 'z']);
    expect(result.map((o) => o.sufficient)).toEqual([true, false, false]);
    expect(result.map((o) => o.shortLineCount)).toEqual([0, 1, 1]);
    expect(result.every((o) => o.branchId === null)).toBe(true);
    expect(result[0].orderCode).toBe('SO-0003');

    // Y: cần 3, tồn toàn chuỗi 2, thiếu 1.
    expect(result[1].lines).toEqual([
      { itemId: 'item-500', itemCode: 'SKU-500', itemName: 'Tên SKU-500', required: 3, available: 2, shortBy: 1 },
    ]);
    // Z: dòng đủ (SKU-500) trước dòng thiếu (SKU-900 cần 2, tồn 0).
    expect(result[2].lines.map((l) => [l.itemCode, l.required, l.available, l.shortBy])).toEqual([
      ['SKU-500', 1, 2, 0],
      ['SKU-900', 2, 0, 2],
    ]);

    // Một lượt đọc tồn toàn chuỗi cho cả ba đơn, không lọc chi nhánh.
    expect(manager.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(clauses.some((c) => c.includes('branchId'))).toBe(false);
  });

  it('AC-43: branchId theo từng đơn cho ra tồn đúng chi nhánh — Q trước P', async () => {
    const orders: OrderRow[] = [
      { id: 'p', organizationId: 'org-1', documentNumber: 'SO-0001' },
      { id: 'q', organizationId: 'org-1', documentNumber: 'SO-0002' },
    ];
    const lines = [line('p', 'item-500', 'SKU-500', '2'), line('q', 'item-500', 'SKU-500', '1')];
    const { service, manager } = fakeOrderManager(balances, orders, lines);

    const result = await service.checkOrders('org-1', [
      { orderId: 'p', branchId: 'cn-a' },
      { orderId: 'q', branchId: 'cn-b' },
    ]);

    expect(result.map((o) => o.orderId)).toEqual(['q', 'p']);
    expect(result[0]).toMatchObject({ branchId: 'cn-b', sufficient: true, shortLineCount: 0 });
    // P: cần 2, CN-A chỉ có 1 (toàn chuỗi là 2 — nếu lọt thành toàn chuỗi thì P "đủ").
    expect(result[1]).toMatchObject({ branchId: 'cn-a', sufficient: false, shortLineCount: 1 });
    expect(result[1].lines[0]).toMatchObject({ required: 2, available: 1, shortBy: 1 });
    // Một lượt đọc mỗi chi nhánh khác nhau.
    expect(manager.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('một lượt đọc cho toàn chuỗi + một lượt mỗi chi nhánh, không phải mỗi đơn', async () => {
    const orders: OrderRow[] = ['o1', 'o2', 'o3', 'o4'].map((id, i) => ({
      id,
      organizationId: 'org-1',
      documentNumber: `SO-000${i + 1}`,
    }));
    const lines = orders.map((o) => line(o.id, 'item-500', 'SKU-500', '1'));
    const { service, manager } = fakeOrderManager(balances, orders, lines);

    const result = await service.checkOrders('org-1', [
      { orderId: 'o1', branchId: 'cn-a' },
      { orderId: 'o2', branchId: 'cn-a' },
      { orderId: 'o3' },
      { orderId: 'o4' },
    ]);

    expect(manager.createQueryBuilder).toHaveBeenCalledTimes(2);
    const byId = new Map(result.map((o) => [o.orderId, o]));
    expect(byId.get('o1')!.lines[0].available).toBe(1);
    expect(byId.get('o3')!.lines[0].available).toBe(2);
  });

  it('dòng trùng món trong một đơn được gộp SL trước khi so', async () => {
    const orders: OrderRow[] = [{ id: 'd', organizationId: 'org-1', documentNumber: 'SO-0001' }];
    const lines = [line('d', 'item-500', 'SKU-500', '1'), line('d', 'item-500', 'SKU-500', '1.5')];
    const { service } = fakeOrderManager(balances, orders, lines);

    const [order] = await service.checkOrders('org-1', [{ orderId: 'd' }]);

    // Từng dòng riêng (1 và 1.5) đều ≤ 2, nhưng gộp lại 2.5 > 2.
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]).toMatchObject({ required: 2.5, available: 2, shortBy: 0.5 });
    expect(order.sufficient).toBe(false);
  });

  it('trong một đơn: dòng đủ trước dòng thiếu, kể cả khi mã dòng thiếu nhỏ hơn', async () => {
    const orders: OrderRow[] = [{ id: 'm', organizationId: 'org-1', documentNumber: 'SO-0001' }];
    const lines = [line('m', 'item-900', 'A-900', '1'), line('m', 'item-500', 'B-500', '1')];
    const { service } = fakeOrderManager(balances, orders, lines);

    const [order] = await service.checkOrders('org-1', [{ orderId: 'm' }]);

    expect(order.lines.map((l) => l.itemCode)).toEqual(['B-500', 'A-900']);
  });

  it('đơn của tổ chức khác (hoặc id không có) bị bỏ qua — không lỗi, không lộ', async () => {
    const orders: OrderRow[] = [
      { id: 'mine', organizationId: 'org-1', documentNumber: 'SO-0001' },
      { id: 'foreign', organizationId: 'org-2', documentNumber: 'SO-9999' },
    ];
    const lines = [line('mine', 'item-500', 'SKU-500', '1'), line('foreign', 'item-900', 'SKU-900', '1')];
    const { service, find } = fakeOrderManager(balances, orders, lines);

    const result = await service.checkOrders('org-1', [
      { orderId: 'foreign' },
      { orderId: 'missing' },
      { orderId: 'mine' },
    ]);

    expect(result.map((o) => o.orderId)).toEqual(['mine']);
    expect(find).toHaveBeenCalledWith(
      SalesOrderEntity,
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
  });

  it('heldByBranchId: chỉ nhận đơn chi nhánh đó đang giữ, đơn chi nhánh khác bị bỏ qua', async () => {
    const orders: OrderRow[] = [
      { id: 'own', organizationId: 'org-1', documentNumber: 'SO-0001', branchId: 'cn-a' },
      { id: 'other', organizationId: 'org-1', documentNumber: 'SO-0002', branchId: 'cn-b' },
      { id: 'pool', organizationId: 'org-1', documentNumber: 'SO-0003', branchId: null },
    ];
    const lines = orders.map((o) => line(o.id, 'item-500', 'SKU-500', '1'));
    const { service, find } = fakeOrderManager(balances, orders, lines);

    const result = await service.checkOrders(
      'org-1',
      orders.map((o) => ({ orderId: o.id, branchId: 'cn-a' })),
      undefined,
      'cn-a',
    );

    expect(result.map((o) => o.orderId)).toEqual(['own']);
    expect(find).toHaveBeenCalledWith(
      SalesOrderEntity,
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', branchId: 'cn-a' }) }),
    );
  });

  it('không có heldByBranchId thì KHÔNG lọc đơn theo chi nhánh (đường Admin)', async () => {
    const { service, find } = fakeOrderManager(balances, [], []);

    await service.checkOrders('org-1', [{ orderId: 'x' }]);

    expect(find.mock.calls[0][1].where).not.toHaveProperty('branchId');
  });

  it('không đơn nào thuộc tổ chức thì trả rỗng và không đọc tồn', async () => {
    const { service, manager } = fakeOrderManager(balances, [], []);

    const result = await service.checkOrders('org-1', [{ orderId: 'nope' }]);

    expect(result).toEqual([]);
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });
});

describe('StockCheckDto', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';

  async function errorsFor(body: unknown) {
    return validate(plainToInstance(StockCheckDto, body));
  }

  it('nhận danh sách đơn, branchId tuỳ chọn', async () => {
    expect(await errorsFor({ orders: [{ orderId: uuid }, { orderId: uuid, branchId: uuid }] })).toEqual([]);
  });

  it('từ chối danh sách rỗng và quá 100 đơn', async () => {
    expect(await errorsFor({ orders: [] })).not.toEqual([]);
    expect(await errorsFor({ orders: Array.from({ length: 101 }, () => ({ orderId: uuid })) })).not.toEqual([]);
    expect(await errorsFor({ orders: Array.from({ length: 100 }, () => ({ orderId: uuid })) })).toEqual([]);
  });

  it('từ chối orderId / branchId không phải uuid', async () => {
    expect(await errorsFor({ orders: [{ orderId: 'x' }] })).not.toEqual([]);
    expect(await errorsFor({ orders: [{ orderId: uuid, branchId: 'cn-a' }] })).not.toEqual([]);
  });
});

describe('BranchStockCheckRequestDto', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';

  async function errorsFor(body: unknown) {
    return validate(plainToInstance(BranchStockCheckRequestDto, body));
  }

  it('nhận 1..100 orderId uuid', async () => {
    expect(await errorsFor({ orderIds: [uuid] })).toEqual([]);
    expect(await errorsFor({ orderIds: Array.from({ length: 100 }, () => uuid) })).toEqual([]);
  });

  it('từ chối rỗng, quá 100, và id không phải uuid', async () => {
    expect(await errorsFor({ orderIds: [] })).not.toEqual([]);
    expect(await errorsFor({ orderIds: Array.from({ length: 101 }, () => uuid) })).not.toEqual([]);
    expect(await errorsFor({ orderIds: ['x'] })).not.toEqual([]);
  });
});

function guardPipeline(
  controllerClass: object,
  heldKeys: readonly string[],
  handler: (...args: never[]) => unknown,
) {
  const guard = new PermissionGuard(new Reflector(), {
    hasAnyPermission: jest.fn(async (_u: string, _o: string, keys: string[]) =>
      keys.some((key) => heldKeys.includes(key)),
    ),
  } as never);
  const context = {
    getHandler: () => handler,
    getClass: () => controllerClass,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u-1', organizationId: 'org-1' } }) }),
  } as never;
  return { guard, context };
}

/**
 * ADR-12 / AC-35 (A-46): duyệt + đối chiếu tồn sống ở controller CHI NHÁNH,
 * quyền `pos.sales-order.approve`, giữ `BranchScopeGuard`.
 */
describe('SalesOrderController — confirm + stock-check chi nhánh', () => {
  const actor = { userId: 'u-1', organizationId: 'org-1', branchId: 'cn-a', roles: [] } as unknown as ActorContext;
  const proto = SalesOrderController.prototype;

  it('confirm và stockCheck đòi đúng pos.sales-order.approve, dưới phạm vi chi nhánh', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto.confirm)).toBe('pos.sales-order.approve');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto.stockCheck)).toBe('pos.sales-order.approve');
    expect(Reflect.getMetadata(REQUIRE_BRANCH_SCOPE_KEY, SalesOrderController)).toBe(true);
  });

  it('AC-35: thiếu quyền approve (tư vấn viên) gọi confirm → 403, service.confirm KHÔNG chạy', async () => {
    const service = { confirm: jest.fn() } as unknown as SalesOrderService;
    const controller = new SalesOrderController(service, {} as StockAvailabilityService);
    const { guard, context } = guardPipeline(SalesOrderController, SALES_PERMISSION_KEYS, proto.confirm);

    let denied: unknown;
    const allowed = await guard.canActivate(context).catch((err: unknown) => {
      denied = err;
      return false;
    });
    if (allowed) await controller.confirm('so-1', actor);

    expect(denied).toBeInstanceOf(ForbiddenException);
    expect(service.confirm).not.toHaveBeenCalled();
  });

  it('AC-35: người dùng CN-A gọi với X-Branch-Id của CN-B → BranchScopeGuard 403', () => {
    const guard = new BranchScopeGuard(new Reflector());
    const context = {
      getHandler: () => proto.confirm,
      getClass: () => SalesOrderController,
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-branch-id': 'cn-b' },
          user: { userId: 'u-1', organizationId: 'org-1', branchIds: ['cn-a'] },
        }),
      }),
    } as never;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('có quyền approve (thu ngân) đi lọt; confirm chuyển id + actor cho service', async () => {
    const view = { id: 'so-1' };
    const service = { confirm: jest.fn(async () => view) } as unknown as SalesOrderService;
    const controller = new SalesOrderController(service, {} as StockAvailabilityService);
    const { guard, context } = guardPipeline(SalesOrderController, CASHIER_PERMISSION_KEYS, proto.confirm);

    expect(await guard.canActivate(context)).toBe(true);
    expect(await controller.confirm('so-1', actor)).toBe(view);
    expect(service.confirm).toHaveBeenCalledWith('so-1', actor);
  });

  it('stock-check: thiếu quyền approve → 403', async () => {
    const { guard, context } = guardPipeline(SalesOrderController, SALES_PERMISSION_KEYS, proto.stockCheck);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('AC-31: stock-check dùng tồn TẠI actor.branchId, bỏ qua đơn chi nhánh khác, xếp X, Y, Z', async () => {
    // Fixture AC-31: CN-A còn SKU-500 = 1, SKU-900 = 0; CN-B có thêm SKU-500 = 5
    // (lọt thành toàn chuỗi thì Y "đủ"). Đơn W của CN-B không được lộ.
    const balances: BalanceRow[] = [
      { organizationId: 'org-1', branchId: 'cn-a', itemId: 'item-500', quantity: '1' },
      { organizationId: 'org-1', branchId: 'cn-b', itemId: 'item-500', quantity: '5' },
      { organizationId: 'org-1', branchId: 'cn-b', itemId: 'item-900', quantity: '9' },
    ];
    const orders: OrderRow[] = [
      { id: 'x', organizationId: 'org-1', documentNumber: 'SO-0003', branchId: 'cn-a' },
      { id: 'y', organizationId: 'org-1', documentNumber: 'SO-0001', branchId: 'cn-a' },
      { id: 'z', organizationId: 'org-1', documentNumber: 'SO-0002', branchId: 'cn-a' },
      { id: 'w', organizationId: 'org-1', documentNumber: 'SO-0000', branchId: 'cn-b' },
    ];
    const lines = [
      line('x', 'item-500', 'SKU-500', '1'),
      line('y', 'item-500', 'SKU-500', '3'),
      line('z', 'item-500', 'SKU-500', '1'),
      line('z', 'item-900', 'SKU-900', '2'),
      line('w', 'item-500', 'SKU-500', '1'),
    ];
    const { service: stockAvailability, params } = fakeOrderManager(balances, orders, lines);
    const controller = new SalesOrderController({} as SalesOrderService, stockAvailability);

    const result = await controller.stockCheck({ orderIds: ['z', 'w', 'y', 'x'] }, actor);

    expect(result.orders.map((o) => o.orderId)).toEqual(['x', 'y', 'z']);
    expect(result.orders.every((o) => o.branchId === 'cn-a')).toBe(true);
    expect(result.orders.map((o) => o.sufficient)).toEqual([true, false, false]);
    // Y: cần 3, tồn CN-A 1 → thiếu 2 (toàn chuỗi 6 thì "đủ").
    expect(result.orders[1].lines[0]).toMatchObject({ required: 3, available: 1, shortBy: 2 });
    // Z: SKU-900 tồn CN-A = 0 (CN-B có 9 — không được cộng vào).
    expect(result.orders[2].lines.map((l) => [l.itemCode, l.available, l.shortBy])).toEqual([
      ['SKU-500', 1, 0],
      ['SKU-900', 0, 2],
    ]);
    expect(params.branchId).toBe('cn-a');
  });
});

/**
 * ADR-12: duyệt đã rời đường Admin; admin `stock-check` giữ cho Validate.
 */
describe('AdminSalesOrderController — sau ADR-12', () => {
  const actor = { userId: 'u-1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;

  it('không còn route confirm', () => {
    const proto = AdminSalesOrderController.prototype as unknown as Record<string, unknown>;
    expect(proto.confirm).toBeUndefined();
    const paths = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
      .map((name) => Reflect.getMetadata('path', proto[name] as object));
    expect(paths).not.toContain(':id/confirm');
  });

  it('stock-check: đòi dispatch, thu ngân bị 403; handler khoá theo tổ chức của actor', async () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AdminSalesOrderController.prototype.stockCheck)).toBe(
      'pos.sales-order.dispatch',
    );
    const { guard, context } = guardPipeline(
      AdminSalesOrderController,
      CASHIER_PERMISSION_KEYS,
      AdminSalesOrderController.prototype.stockCheck,
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);

    const controller = new AdminSalesOrderController({} as SalesOrderService);
    const checkOrders = jest.fn(async () => []);
    Object.assign(controller, { stockAvailability: { checkOrders } });
    const orders = [{ orderId: 'so-1', branchId: 'cn-a' }];

    expect(await controller.stockCheck({ orders }, actor)).toEqual({ orders: [] });
    expect(checkOrders).toHaveBeenCalledWith('org-1', orders);
  });
});
