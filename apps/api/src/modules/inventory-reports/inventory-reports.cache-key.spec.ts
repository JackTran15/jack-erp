import { InventoryReportsService } from './inventory-reports.service';
import type { ActorContext } from '../../common/decorators/actor-context.decorator';

/**
 * Khoá cache phải phản ánh **mọi** thứ ảnh hưởng tới kết quả. Bỏ sót một thứ
 * (lọc theo cột, số trang) là lỗi kiểu "lọc xong lưới không đổi gì" — người
 * dùng thấy dữ liệu cũ và tin nó. Đây là điểm ADR-005 yêu cầu kiểm bằng test.
 */
describe('InventoryReportsService — khoá cache', () => {
  const actor: ActorContext = {
    userId: 'u-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  };

  function makeService() {
    const keys: string[] = [];
    const cacheService = {
      getOrSet: jest.fn(async (_ns: string, key: string, factory: () => unknown) => {
        keys.push(key);
        return factory();
      }),
    };
    const empty = { data: [], total: 0, totals: {}, branches: [] };
    const stub = {
      aggregate: jest.fn().mockResolvedValue(empty),
      summarize: jest.fn().mockResolvedValue(empty),
      byBranch: jest.fn().mockResolvedValue(empty),
      list: jest.fn().mockResolvedValue(empty),
    };
    const service = new InventoryReportsService(
      stub as never,
      stub as never,
      stub as never,
      stub as never,
      stub as never,
      cacheService as never,
    );
    return { service, keys };
  }

  it('hai bộ lọc-theo-cột khác nhau cho hai khoá khác nhau', async () => {
    const { service, keys } = makeService();

    await service.stockSummary(actor, { preset: 'this_month' } as never);
    await service.stockSummary(actor, {
      preset: 'this_month',
      columnFilters: { inQty: { operator: '>=', value: 5 } },
    } as never);

    expect(keys[0]).not.toBe(keys[1]);
  });

  it('thứ tự khoá trong bộ lọc không tạo ra khoá cache khác', async () => {
    const { service, keys } = makeService();

    await service.stockSummary(actor, {
      preset: 'this_month',
      columnFilters: {
        inQty: { operator: '>=', value: 5 },
        outQty: { operator: '<=', value: 9 },
      },
    } as never);
    await service.stockSummary(actor, {
      preset: 'this_month',
      columnFilters: {
        outQty: { operator: '<=', value: 9 },
        inQty: { operator: '>=', value: 5 },
      },
    } as never);

    expect(keys[0]).toBe(keys[1]);
  });

  it('hai trang khác nhau cho hai khoá khác nhau', async () => {
    const { service, keys } = makeService();

    await service.stockSummary(actor, { preset: 'this_month', page: 1 } as never);
    await service.stockSummary(actor, { preset: 'this_month', page: 2 } as never);

    expect(keys[0]).not.toBe(keys[1]);
  });

  it('báo cáo Tổng hợp điều chuyển cũng phân trang, nên trang phải vào khoá', async () => {
    const { service, keys } = makeService();

    await service.transferSummary(actor, { preset: 'this_month', page: 1 } as never);
    await service.transferSummary(actor, { preset: 'this_month', page: 2 } as never);

    expect(keys[0]).not.toBe(keys[1]);
  });

  it('lọc-theo-cột vào khoá của báo cáo chứng từ và báo cáo điều chuyển theo chi nhánh', async () => {
    const { service, keys } = makeService();

    await service.stockDocumentDetails(actor, { preset: 'this_month' } as never);
    await service.stockDocumentDetails(actor, {
      preset: 'this_month',
      columnFilters: { inQty: { operator: '>=', value: 1 } },
    } as never);
    await service.transferByBranch(actor, { preset: 'this_month' } as never);
    await service.transferByBranch(actor, {
      preset: 'this_month',
      columnFilters: { outQty: { operator: '>=', value: 1 } },
    } as never);

    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[3]);
  });
});
