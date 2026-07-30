import { ReportGroupBy } from '@erp/shared-interfaces';
import { RevenueByItemParamsBuilder } from './revenue-by-item-params.builder';

const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

function makeBuilder(opts: { branch?: any; category?: any } = {}) {
  const branches = { findOne: jest.fn(async () => opts.branch ?? null) };
  const categories = { findOne: jest.fn(async () => opts.category ?? null) };
  return {
    builder: new RevenueByItemParamsBuilder(branches as any, categories as any),
    branches,
    categories,
  };
}

describe('RevenueByItemParamsBuilder', () => {
  it('returns nothing when there are no filters at all', async () => {
    const { builder } = makeBuilder();
    expect(await builder.build(undefined, actor)).toEqual([]);
  });

  it('prints all 6 parts with defaults when nothing but the date range is set (AC-12)', async () => {
    const { builder } = makeBuilder({ branch: { name: 'Chi nhánh 211 TP. Đà Nẵng' } });
    const lines = await builder.build({ issuedAt: {} } as any, actor);
    expect(lines).toEqual([
      'Xem theo cửa hàng: Chi nhánh 211 TP. Đà Nẵng; Nhóm hàng hóa: Tất cả nhóm; ' +
        'Thống kê theo: Hàng hóa; Thống kê theo chi nhánh: Không; ' +
        'Loại hàng hóa: Hàng hóa; Thương hiệu: Tất cả',
    ]);
  });

  it('never contains ": False"', async () => {
    const { builder } = makeBuilder({ branch: { name: 'CN 1' } });
    const [line] = await builder.build(
      { issuedAt: {}, statisticByBrand: false, allocateComboRevenue: false } as any,
      actor,
    );
    expect(line).not.toContain(': False');
  });

  it('resolves the real category name when categoryId is set (AC-13)', async () => {
    const { builder } = makeBuilder({
      branch: { name: 'CN 1' },
      category: { name: 'Giày nam' },
    });
    const [line] = await builder.build(
      { issuedAt: {}, categoryId: 'cat-1' } as any,
      actor,
    );
    expect(line).toContain('Nhóm hàng hóa: Giày nam');
  });

  it('falls back to the "đã lọc" marker when categoryId does not resolve, without throwing (AC-14)', async () => {
    const { builder } = makeBuilder({ branch: { name: 'CN 1' }, category: null });
    const [line] = await builder.build(
      { issuedAt: {}, categoryId: 'cat-deleted' } as any,
      actor,
    );
    expect(line).toContain('Nhóm hàng hóa: đã lọc');
  });

  it('prints "Toàn hệ thống" for store scope=all (AC-15)', async () => {
    const { builder } = makeBuilder();
    const [line] = await builder.build(
      { issuedAt: {}, store: { scope: 'all', storeIds: [] } } as any,
      actor,
    );
    expect(line).toContain('Xem theo cửa hàng: Toàn hệ thống');
  });

  it('prints the count for store scope=group with more than one store (AC-15)', async () => {
    const { builder } = makeBuilder();
    const [line] = await builder.build(
      {
        issuedAt: {},
        store: { scope: 'group', storeIds: ['b1', 'b2', 'b3'] },
      } as any,
      actor,
    );
    expect(line).toContain('Xem theo cửa hàng: 3 cửa hàng được chọn');
  });

  it('resolves the real branch name for store scope=group with exactly one store', async () => {
    const { builder, branches } = makeBuilder({ branch: { name: 'CN Quận 1' } });
    const [line] = await builder.build(
      { issuedAt: {}, store: { scope: 'group', storeIds: ['b9'] } } as any,
      actor,
    );
    expect(line).toContain('Xem theo cửa hàng: CN Quận 1');
    expect(branches.findOne).toHaveBeenCalledWith({
      where: { id: 'b9', organizationId: ORG },
    });
  });

  it('labels grain=parent as "Mẫu mã"', async () => {
    const { builder } = makeBuilder({ branch: { name: 'CN 1' } });
    const [line] = await builder.build(
      { issuedAt: {}, statBy: ReportGroupBy.PARENT } as any,
      actor,
    );
    expect(line).toContain('Thống kê theo: Mẫu mã');
  });

  it('appends the ERP-specific flags only when they are on', async () => {
    const { builder } = makeBuilder({ branch: { name: 'CN 1' } });

    const [off] = await builder.build({ issuedAt: {} } as any, actor);
    expect(off).not.toContain('Thống kê theo thương hiệu');
    expect(off).not.toContain('Phân bổ doanh thu combo');

    const [on] = await builder.build(
      { issuedAt: {}, statisticByBrand: true, allocateComboRevenue: true } as any,
      actor,
    );
    expect(on).toContain('Thống kê theo thương hiệu: Có');
    expect(on).toContain('Phân bổ doanh thu combo: Có');
  });

  it('makes at most 2 repository calls, and 0 when neither store nor category resolve to an id', async () => {
    const { builder, branches, categories } = makeBuilder({ branch: { name: 'CN 1' } });
    await builder.build({ issuedAt: {}, categoryId: 'cat-1' } as any, actor);
    expect(branches.findOne).toHaveBeenCalledTimes(1);
    expect(categories.findOne).toHaveBeenCalledTimes(1);

    const chainWideActor = { ...actor, branchId: undefined };
    const { builder: builder2, branches: branches2, categories: categories2 } = makeBuilder();
    await builder2.build({ issuedAt: {} } as any, chainWideActor);
    expect(branches2.findOne).not.toHaveBeenCalled();
    expect(categories2.findOne).not.toHaveBeenCalled();
  });
});
