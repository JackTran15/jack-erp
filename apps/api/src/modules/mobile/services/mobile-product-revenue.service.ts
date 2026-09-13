import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ReportGroupBy } from '@erp/shared-interfaces';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceReportSearchDto } from '../../reporting/invoice-report/dto/invoice-report-search.dto';
import { SearchInvoiceReportQuery } from '../../reporting/invoice-report/queries/search-invoice-report.query';
import { MobileProductRevenueQueryDto } from '../dto/mobile-product-revenue.query.dto';

/**
 * Cột mà màn của app đọc, và **chỉ** những cột đó.
 *
 * Báo cáo gốc có mười lăm cột (giá vốn, lợi nhuận, tỉ lệ khuyến mại, thương
 * hiệu, kho…). Một hàng của app bày đúng bốn thứ: mã, tên, số lượng kèm đơn vị,
 * doanh thu. Xin thừa cột là kéo về một tập dữ liệu không ai nhìn — và ở một báo
 * cáo gộp thì mỗi cột thừa là một phép tính thừa trên toàn kỳ.
 */
const COLUMNS = ['sku', 'itemName', 'unit', 'quantity', 'revenue.total'];

/**
 * Doanh thu theo mặt hàng, uỷ quyền cho báo cáo `revenue-by-item`.
 *
 * # PHẠM VI: theo CHI NHÁNH đang làm việc, **KHÔNG** theo từng nhân viên
 *
 * Khác hoá đơn (ADR-24), và khác vì một ràng buộc ĐO ĐƯỢC chứ không phải một
 * lựa chọn: **báo cáo `revenue-by-item` bỏ qua bộ lọc `salespersonId`.**
 *
 * `InvoiceReportFilterDto` có khai trường đó kèm comment *"matches
 * invoice.salespersonId"*, nhưng `revenue-by-item.report.ts` dựng truy vấn chỉ
 * với `organizationId`, phạm vi chi nhánh, khoảng ngày và loại hoá đơn — không
 * chỗ nào đọc `salespersonId`. Đo trên API thật (2026-09-10): gửi một uuid có
 * thật, một uuid bịa, và không gửi gì — **cả ba cho cùng 1283 dòng và cùng
 * 4.226.556.500đ**.
 *
 * Nên service này KHÔNG gửi `salespersonId`. Gửi một bộ lọc bị bỏ qua rồi ghi
 * doc "chỉ của mình" là thứ tệ nhất trong ba lối: nó trông như đã có phạm vi,
 * và người đọc code sau sẽ tin.
 *
 * Phạm vi CHI NHÁNH thì có thật — `applyBranchScope` ở báo cáo gốc dùng
 * `actor.branchId`. Người bán đọc được doanh thu theo mặt hàng của cửa hàng
 * mình, không phải của cả tổ chức.
 *
 * TODO(scope): nếu chốt là phải hẹp về từng nhân viên thì sửa ở
 * `revenue-by-item.report.ts` — thêm `.applyEnum('invoice.salespersonId', ...)`
 * vào `buildQuery`. Đó là một thay đổi CỘNG THÊM ở báo cáo dùng chung, không
 * phải một lớp lọc thứ hai ở đây.
 */
@Injectable()
export class MobileProductRevenueService {
  constructor(private readonly queryBus: QueryBus) {}

  list(query: MobileProductRevenueQueryDto, actor: ActorContext) {
    const dto: InvoiceReportSearchDto = {
      reportType: 'revenue-by-item',
      columns: COLUMNS,
      filters: {
        statBy: query.statBy ?? ReportGroupBy.PARENT,
        // Khoảng ngày là BẮT BUỘC ở báo cáo gốc — thiếu nó là
        // `400 filters.issuedAt.from is required`. Vì thế DTO của đường này
        // cũng khai bắt buộc, thay vì để client phát hiện bằng một lỗi 400 đến
        // từ một tầng nó không biết tới.
        issuedAt: { from: query.from, to: query.to },
      } as InvoiceReportSearchDto['filters'],
      page: query.page,
      limit: query.limit,
    };

    return this.queryBus.execute(new SearchInvoiceReportQuery(dto, actor));
  }
}
