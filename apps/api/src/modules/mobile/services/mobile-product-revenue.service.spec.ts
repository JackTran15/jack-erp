import { ReportGroupBy } from '@erp/shared-interfaces';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { SearchInvoiceReportQuery } from '../../reporting/invoice-report/queries/search-invoice-report.query';
import { MobileProductRevenueQueryDto } from '../dto/mobile-product-revenue.query.dto';
import { MobileProductRevenueService } from './mobile-product-revenue.service';

describe('MobileProductRevenueService', () => {
  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  } as ActorContext;

  const range = { from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z' };

  function build() {
    const execute = jest.fn().mockResolvedValue({ rows: [], totals: {}, total: 0 });

    return { service: new MobileProductRevenueService({ execute } as never), execute };
  }

  const queryOf = (execute: jest.Mock) => execute.mock.calls[0][0] as SearchInvoiceReportQuery;

  it('đặt CỨNG `reportType`, client không chọn được báo cáo nào khác', () => {
    // Quyền của đường này chỉ đủ cho đúng một báo cáo. Nhận `reportType` từ
    // client là biến nó thành một cửa chạy MỌI báo cáo.
    const { service, execute } = build();

    service.list(range, actor);

    expect(queryOf(execute).dto.reportType).toBe('revenue-by-item');
  });

  it('xin ĐÚNG năm cột màn hình đọc', () => {
    const { service, execute } = build();

    service.list(range, actor);

    expect(queryOf(execute).dto.columns).toEqual(['sku', 'itemName', 'unit', 'quantity', 'revenue.total']);
  });

  it('mặc định gộp theo MẪU MÃ', () => {
    const { service, execute } = build();

    service.list(range, actor);

    expect(queryOf(execute).dto.filters.statBy).toBe(ReportGroupBy.PARENT);
  });

  it('chuyển khoảng ngày vào `filters.issuedAt`', () => {
    // Báo cáo gốc trả 400 khi thiếu — đo được trên API thật.
    const { service, execute } = build();

    service.list(range, actor);

    expect(queryOf(execute).dto.filters.issuedAt).toEqual(range);
  });

  it('KHÔNG gửi `salespersonId` — báo cáo bỏ qua nó', () => {
    // Đo trên API thật (2026-09-10): uuid có thật, uuid bịa, và không gửi gì
    // đều cho cùng 1283 dòng / 4.226.556.500đ. Gửi một bộ lọc bị bỏ qua rồi ghi
    // doc "chỉ của mình" là trông như đã có phạm vi trong khi không có.
    const { service, execute } = build();

    service.list(range, actor);

    expect(queryOf(execute).dto.filters).not.toHaveProperty('salespersonId');
  });

  describe('MobileProductRevenueQueryDto', () => {
    const check = (payload: Record<string, unknown>) =>
      validate(plainToInstance(MobileProductRevenueQueryDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it('TỪ CHỐI khi THIẾU khoảng ngày', async () => {
      expect(await check({})).not.toHaveLength(0);
    });

    it('TỪ CHỐI `statBy=item` — nút gạt của màn chỉ có hai nấc', async () => {
      expect(await check({ ...range, statBy: 'item' })).not.toHaveLength(0);
    });

    it('TỪ CHỐI `reportType` gửi lên', async () => {
      expect(await check({ ...range, reportType: 'profit-by-item' })).not.toHaveLength(0);
    });

    it('nhận hai chế độ gộp hợp lệ', async () => {
      expect(await check({ ...range, statBy: 'parent' })).toHaveLength(0);
      expect(await check({ ...range, statBy: 'group' })).toHaveLength(0);
    });
  });
});
