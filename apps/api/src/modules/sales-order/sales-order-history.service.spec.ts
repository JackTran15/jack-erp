import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, FindOperator } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { BranchEntity } from '../branch/branch.entity';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import {
  SalesOrderDispatchAction,
  SalesOrderDispatchEventEntity,
} from './entities/sales-order-dispatch-event.entity';
import { SalesOrderEntity, SalesOrderStatus } from './entities/sales-order.entity';
import { SalesOrderHistoryKind, SalesOrderHistoryService } from './sales-order-history.service';
import { ORDER_NOT_HELD_BY_BRANCH } from './sales-order.service';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const CA_MAU = 'branch-camau';
const MAIN = 'branch-main';
const CAN_THO = 'branch-cantho';

type Row = Record<string, unknown>;

/**
 * Bản giả `manager`: mỗi entity một bảng hàng, `find`/`findOne` lọc ĐÚNG theo
 * `where` service truyền vào (kể cả `In(...)`). Quên khoá tổ chức hay quên lọc
 * theo đơn thì kết quả sai thật, không phải một hằng số dựng sẵn vẫn xanh.
 */
function fakeDataSource(tables: Map<unknown, Row[]>) {
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, cond]) => {
      const op = cond as FindOperator<unknown> | undefined;
      if (op && typeof op === 'object' && (op as { type?: string }).type === 'in') {
        return (op.value as unknown as unknown[]).includes(row[key]);
      }
      return row[key] === cond;
    });
  const find = jest.fn(async (entity: unknown, opts: { where: Row; order?: Row }) => {
    const rows = (tables.get(entity) ?? []).filter((r) => matches(r, opts.where));
    if (opts.order?.createdAt === 'ASC') {
      rows.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
    }
    return rows;
  });
  const findOne = jest.fn(async (entity: unknown, opts: { where: Row }) =>
    (tables.get(entity) ?? []).find((r) => matches(r, opts.where)) ?? null,
  );
  const dataSource = { manager: { find, findOne } } as unknown as DataSource;
  return { dataSource, find, findOne };
}

const t = (minute: number) => new Date(Date.UTC(2026, 8, 24, 1, minute, 0));

function order(overrides: Partial<SalesOrderEntity> = {}): Row {
  return {
    id: 'so-1',
    organizationId: ORG,
    documentNumber: 'DT000001',
    status: SalesOrderStatus.SENT,
    salespersonId: null,
    salespersonName: null,
    salesChannel: 'Website công ty',
    branchId: null,
    createdAt: t(0),
    createdBy: 'u-shadow',
    invoiceId: null,
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectReason: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    ...overrides,
  };
}

function event(
  minute: number,
  action: SalesOrderDispatchAction,
  actorUserId: string,
  extra: Partial<SalesOrderDispatchEventEntity> = {},
): Row {
  return {
    id: `ev-${minute}-${action}`,
    organizationId: ORG,
    salesOrderId: 'so-1',
    action,
    fromBranchId: null,
    toBranchId: null,
    actorUserId,
    reason: null,
    createdAt: t(minute),
    ...extra,
  };
}

const users: Row[] = [
  { id: 'u-shadow', organizationId: ORG, firstName: 'API', lastName: 'Shadow' },
  { id: 'u-admin', organizationId: ORG, firstName: 'Lan', lastName: 'Admin' },
  { id: 'u-camau', organizationId: ORG, firstName: 'Minh', lastName: 'CàMau' },
  { id: 'u-main', organizationId: ORG, firstName: 'Hoa', lastName: 'Main' },
  { id: 'u-cashier', organizationId: ORG, firstName: 'Thu', lastName: 'Ngân' },
  { id: 'u-sales', organizationId: ORG, firstName: 'Tư', lastName: 'Vấn' },
];
const branches: Row[] = [
  { id: CA_MAU, organizationId: ORG, name: 'Cà Mau' },
  { id: MAIN, organizationId: ORG, name: 'Main Branch' },
  { id: CAN_THO, organizationId: ORG, name: 'Cần Thơ' },
];
const invoices: Row[] = [{ id: 'inv-1', organizationId: ORG, code: 'HD000123' }];

function setup(orders: Row[], events: Row[] = []) {
  const tables = new Map<unknown, Row[]>([
    [SalesOrderEntity, orders],
    [SalesOrderDispatchEventEntity, events],
    [UserEntity, users],
    [BranchEntity, branches],
    [InvoiceEntity, invoices],
  ]);
  const fake = fakeDataSource(tables);
  return { service: new SalesOrderHistoryService(fake.dataSource), ...fake };
}

/** Vòng đủ của demo UOW-13: nhận → phân Cà Mau → duyệt → trả về → phân Main → duyệt → xử lý. */
function fullCycle() {
  return setup(
    [
      order({
        status: SalesOrderStatus.PROCESSED,
        branchId: MAIN,
        approvedAt: t(60),
        approvedBy: 'u-cashier',
        invoiceId: 'inv-1',
      }),
    ],
    [
      // Cố ý xáo thứ tự nạp: service không được tin thứ tự mảng.
      event(40, SalesOrderDispatchAction.DISPATCH, 'u-admin', { toBranchId: MAIN }),
      event(10, SalesOrderDispatchAction.DISPATCH, 'u-admin', { toBranchId: CA_MAU }),
      event(30, SalesOrderDispatchAction.RETURN, 'u-camau', { fromBranchId: CA_MAU, reason: 'hết hàng' }),
      event(20, SalesOrderDispatchAction.CONFIRM, 'u-camau'),
      event(50, SalesOrderDispatchAction.CONFIRM, 'u-main'),
    ],
  );
}

describe('SalesOrderHistoryService.timeline', () => {
  it('vòng đủ 7 mốc đúng thứ tự, đúng người, chi nhánh, lý do, mã hoá đơn và statusAfter (AC-50)', async () => {
    const { service } = fullCycle();

    const history = await service.timeline('so-1', ORG);

    expect(history).toMatchObject({ orderId: 'so-1', orderCode: 'DT000001', currentStatus: SalesOrderStatus.PROCESSED });
    expect(history.entries).toEqual([
      { at: t(0).toISOString(), kind: SalesOrderHistoryKind.RECEIVED, actorName: 'Website công ty', statusAfter: 'Chờ phân' },
      { at: t(10).toISOString(), kind: SalesOrderHistoryKind.DISPATCHED, actorName: 'Lan Admin', branchName: 'Cà Mau', statusAfter: 'Chờ duyệt' },
      { at: t(20).toISOString(), kind: SalesOrderHistoryKind.CONFIRMED, actorName: 'Minh CàMau', branchName: 'Cà Mau', statusAfter: 'Đã duyệt' },
      { at: t(30).toISOString(), kind: SalesOrderHistoryKind.RETURNED, actorName: 'Minh CàMau', branchName: 'Cà Mau', reason: 'hết hàng', statusAfter: 'Chờ phân' },
      { at: t(40).toISOString(), kind: SalesOrderHistoryKind.DISPATCHED, actorName: 'Lan Admin', branchName: 'Main Branch', statusAfter: 'Chờ duyệt' },
      { at: t(50).toISOString(), kind: SalesOrderHistoryKind.CONFIRMED, actorName: 'Hoa Main', branchName: 'Main Branch', statusAfter: 'Đã duyệt' },
      {
        at: t(60).toISOString(),
        kind: SalesOrderHistoryKind.PROCESSED,
        actorName: 'Thu Ngân',
        branchName: 'Main Branch',
        invoiceCode: 'HD000123',
        statusAfter: 'Đã xử lý',
      },
    ]);
  });

  it('đơn web: "Nhận đơn" hiện tên kênh, không tra tên shadow user (A-54)', async () => {
    const { service, find } = fullCycle();

    const history = await service.timeline('so-1', ORG);

    expect(history.entries[0].actorName).toBe('Website công ty');
    const userQuery = find.mock.calls.find(([entity]) => entity === UserEntity);
    expect((userQuery![1].where.id as FindOperator<string[]>).value).not.toContain('u-shadow');
  });

  it('tên người / chi nhánh / hoá đơn: MỘT câu mỗi bảng, luôn khoá tổ chức', async () => {
    const { service, find } = fullCycle();

    await service.timeline('so-1', ORG);

    for (const entity of [UserEntity, BranchEntity, InvoiceEntity, SalesOrderDispatchEventEntity]) {
      const calls = find.mock.calls.filter(([e]) => e === entity);
      expect(calls).toHaveLength(1);
      expect(calls[0][1].where.organizationId).toBe(ORG);
    }
  });

  it('huỷ có lý do: mốc cuối là "Huỷ đơn" có người, thời gian và lý do (AC-51)', async () => {
    const { service } = setup(
      [
        order({
          status: SalesOrderStatus.CANCELLED,
          branchId: CA_MAU,
          cancelledAt: t(30),
          cancelledBy: 'u-admin',
          cancelReason: 'khách đổi ý',
        }),
      ],
      [event(10, SalesOrderDispatchAction.DISPATCH, 'u-admin', { toBranchId: CA_MAU })],
    );

    const history = await service.timeline('so-1', ORG);

    expect(history.entries.at(-1)).toEqual({
      at: t(30).toISOString(),
      kind: SalesOrderHistoryKind.CANCELLED,
      actorName: 'Lan Admin',
      branchName: 'Cà Mau',
      reason: 'khách đổi ý',
      statusAfter: 'Đã huỷ',
    });
  });

  it('từ chối có lý do: mốc "Từ chối" mang người và lý do', async () => {
    const { service } = setup([
      order({
        status: SalesOrderStatus.REJECTED,
        salespersonId: 'profile-1',
        salespersonName: 'Tư Vấn',
        createdBy: 'u-sales',
        branchId: MAIN,
        rejectedAt: t(5),
        rejectedBy: 'u-cashier',
        rejectReason: 'sai giá',
      }),
    ]);

    const history = await service.timeline('so-1', ORG);

    expect(history.entries.at(-1)).toMatchObject({
      kind: SalesOrderHistoryKind.REJECTED,
      actorName: 'Thu Ngân',
      reason: 'sai giá',
      statusAfter: 'Từ chối',
    });
  });

  it('đơn cũ không có dòng sự kiện nào vẫn có "Nhận đơn" + "Thu ngân xử lý" từ cột của đơn (AC-51)', async () => {
    const { service } = setup([
      order({
        status: SalesOrderStatus.PROCESSED,
        branchId: MAIN,
        approvedAt: t(15),
        approvedBy: 'u-cashier',
        invoiceId: 'inv-1',
      }),
    ]);

    const history = await service.timeline('so-1', ORG);

    expect(history.entries.map((e) => e.kind)).toEqual([
      SalesOrderHistoryKind.RECEIVED,
      SalesOrderHistoryKind.PROCESSED,
    ]);
    expect(history.entries[1]).toMatchObject({ actorName: 'Thu Ngân', invoiceCode: 'HD000123', statusAfter: 'Đã xử lý' });
  });

  it('đơn tư vấn viên (mobile): "Nhận đơn" = tư vấn viên, "Chờ xử lý", không có mốc điều phối (AC-54)', async () => {
    const { service } = setup([
      order({
        status: SalesOrderStatus.PROCESSED,
        salespersonId: 'profile-1',
        salespersonName: 'Tư Vấn',
        salesChannel: 'Tư vấn viên',
        createdBy: 'u-sales',
        branchId: MAIN,
        approvedAt: t(20),
        approvedBy: 'u-cashier',
        invoiceId: 'inv-1',
      }),
    ]);

    const history = await service.timeline('so-1', ORG);

    expect(history.entries).toEqual([
      { at: t(0).toISOString(), kind: SalesOrderHistoryKind.RECEIVED, actorName: 'Tư Vấn', branchName: 'Main Branch', statusAfter: 'Chờ xử lý' },
      {
        at: t(20).toISOString(),
        kind: SalesOrderHistoryKind.PROCESSED,
        actorName: 'Thu Ngân',
        branchName: 'Main Branch',
        invoiceCode: 'HD000123',
        statusAfter: 'Đã xử lý',
      },
    ]);
  });

  it('đơn mobile thiếu tên chốt thì tra tên người tạo trong `users`', async () => {
    const { service } = setup([
      order({ salespersonId: 'profile-1', salespersonName: null, createdBy: 'u-sales', branchId: MAIN }),
    ]);

    const history = await service.timeline('so-1', ORG);

    expect(history.entries[0].actorName).toBe('Tư Vấn');
  });

  it('CONFIRMED lấy chi nhánh từ DISPATCHED gần nhất TRƯỚC nó, không phải chi nhánh hiện tại (A-54)', async () => {
    const { service } = setup(
      [order({ branchId: MAIN })],
      [
        event(10, SalesOrderDispatchAction.DISPATCH, 'u-admin', { toBranchId: CA_MAU }),
        event(20, SalesOrderDispatchAction.CONFIRM, 'u-camau'),
        // Phân lại thẳng từ Cà Mau sang Main: có chi nhánh gốc.
        event(30, SalesOrderDispatchAction.DISPATCH, 'u-admin', { fromBranchId: CA_MAU, toBranchId: MAIN }),
      ],
    );

    const history = await service.timeline('so-1', ORG);

    expect(history.entries[2]).toMatchObject({ kind: SalesOrderHistoryKind.CONFIRMED, branchName: 'Cà Mau' });
    expect(history.entries[3]).toMatchObject({
      kind: SalesOrderHistoryKind.DISPATCHED,
      branchName: 'Main Branch',
      fromBranchName: 'Cà Mau',
    });
  });

  it('hai mốc cùng thời điểm xếp theo thứ tự vòng đời, không theo thứ tự nạp', async () => {
    const { service } = setup(
      [
        order({
          status: SalesOrderStatus.PROCESSED,
          branchId: CA_MAU,
          approvedAt: t(10),
          approvedBy: 'u-cashier',
          invoiceId: 'inv-1',
          createdAt: t(10),
        }),
      ],
      [
        // Duyệt nạp trước phân, cùng giây với nhận đơn và xử lý.
        event(10, SalesOrderDispatchAction.CONFIRM, 'u-camau'),
        event(10, SalesOrderDispatchAction.DISPATCH, 'u-admin', { toBranchId: CA_MAU }),
      ],
    );

    const history = await service.timeline('so-1', ORG);

    expect(history.entries.map((e) => [e.kind, e.statusAfter])).toEqual([
      [SalesOrderHistoryKind.RECEIVED, 'Chờ phân'],
      [SalesOrderHistoryKind.DISPATCHED, 'Chờ duyệt'],
      [SalesOrderHistoryKind.CONFIRMED, 'Đã duyệt'],
      [SalesOrderHistoryKind.PROCESSED, 'Đã xử lý'],
    ]);
    // Chi nhánh duyệt vẫn đúng dù DISPATCH nạp sau CONFIRM.
    expect(history.entries[2].branchName).toBe('Cà Mau');
  });

  it('heldByBranchId khác chi nhánh đang giữ → 403 ORDER_NOT_HELD_BY_BRANCH, không đọc sự kiện (AC-52)', async () => {
    const { service, find } = fullCycle();

    const err = await service.timeline('so-1', ORG, { heldByBranchId: CAN_THO }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: ORDER_NOT_HELD_BY_BRANCH });
    expect(find).not.toHaveBeenCalled();
  });

  it('heldByBranchId với đơn còn trong pool → 403', async () => {
    const { service } = setup([order()]);

    await expect(service.timeline('so-1', ORG, { heldByBranchId: MAIN })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('heldByBranchId đúng chi nhánh đang giữ → thấy TOÀN BỘ lịch sử, kể cả mốc chi nhánh khác trả về (A-53)', async () => {
    const { service } = fullCycle();

    const history = await service.timeline('so-1', ORG, { heldByBranchId: MAIN });

    expect(history.entries).toHaveLength(7);
    expect(history.entries[3]).toMatchObject({ kind: SalesOrderHistoryKind.RETURNED, branchName: 'Cà Mau', reason: 'hết hàng' });
  });

  it('đơn của tổ chức khác → 404', async () => {
    const { service } = setup([order({ organizationId: OTHER_ORG })]);

    await expect(service.timeline('so-1', ORG)).rejects.toBeInstanceOf(NotFoundException);
  });
});
