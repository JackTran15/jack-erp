import { ApiProperty } from '@nestjs/swagger';
import { MobileRevenueTimeUnit } from './mobile-revenue-report.query.dto';

/**
 * Một MẶT HÀNG trong báo cáo doanh thu — khớp `ProductRevenueEntity` phía Dart.
 *
 * Grain là MẪU MÃ (web `statBy=parent`): các biến thể của cùng một mẫu mã gộp
 * thành một dòng; item không thuộc mẫu mã nào đứng một mình. Vì vậy `id` là
 * khoá HỖN HỢP như `/mobile/inventory/products`: id của mẫu mã, hoặc id của
 * item lẻ. Màn con đưa thẳng `id` này vào `items/:id/...`.
 *
 * `quantity`/`revenue` đều đã MANG DẤU: dòng trả hàng (`direction = IN`) trừ
 * đi, nên một mẫu mã bị trả nhiều hơn bán trong kỳ ra số ÂM — đúng cột "Số
 * lượng bán" / "Doanh thu" của web.
 */
export class MobileRevenueItemDto {
  @ApiProperty({ format: 'uuid', description: 'Id mẫu mã, hoặc id item khi item không thuộc mẫu mã' })
  id!: string;

  @ApiProperty({ description: 'Mã mẫu mã; item lẻ thì mã item (snapshot trên dòng hoá đơn)' })
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Đơn vị tính lấy từ dòng hoá đơn' })
  unit!: string;

  @ApiProperty({ description: 'Số lượng bán ròng trong kỳ (bán − trả), có thể ÂM' })
  quantity!: number;

  @ApiProperty({ description: 'Doanh thu ròng trong kỳ, đơn vị đồng, có thể ÂM' })
  revenue!: number;
}

/**
 * Trang mặt hàng. Hai tổng là của TOÀN tập khớp bộ lọc, không phải của trang —
 * khối "Tổng doanh thu / N hàng hoá" của app đứng trên một danh sách cuộn vô
 * tận, cộng các trang đã nạp là cho ra một con số đổi theo lượt cuộn.
 */
export class MobileRevenueItemPageDto {
  @ApiProperty({ type: [MobileRevenueItemDto] })
  data!: MobileRevenueItemDto[];

  @ApiProperty({ description: 'Tổng số mặt hàng có phát sinh trong kỳ, không phải số dòng của trang' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'Tổng số lượng bán ròng toàn tập' })
  totalQuantity!: number;

  @ApiProperty({ description: 'Tổng doanh thu toàn tập, đơn vị đồng' })
  totalRevenue!: number;
}

/**
 * Một NHÓM HÀNG — khớp `ProductCategoryRevenueEntity` phía Dart. Gộp theo
 * `items.category_id` (web `statBy=group`).
 */
export class MobileRevenueCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Doanh thu ròng của nhóm trong kỳ, đơn vị đồng' })
  revenue!: number;
}

/**
 * Tỉ trọng theo nhóm hàng — KHÔNG phân trang: một tổ chức có vài chục nhóm,
 * và biểu đồ tròn cần trọn tập mới vẽ được phần trăm.
 *
 * **Dòng hoá đơn của item CHƯA XẾP NHÓM bị BỎ**, đúng cách web gộp
 * `statBy=group` (`aggregateByItem` bỏ dòng không có key). Hệ quả phải biết:
 * `totalRevenue` ở đây có thể NHỎ HƠN `totalRevenue` của `items` cùng kỳ.
 * Đừng "sửa" bằng cách thêm một nhóm "Khác" ở một mình phía này — muốn đổi
 * thì đổi ở web trước.
 */
export class MobileRevenueCategoryListDto {
  @ApiProperty({ type: [MobileRevenueCategoryDto], description: 'Sắp doanh thu giảm dần, cùng doanh thu thì theo tên' })
  data!: MobileRevenueCategoryDto[];

  @ApiProperty({ description: 'Tổng doanh thu của các nhóm trong `data`' })
  totalRevenue!: number;
}

/** Một CHI NHÁNH đã bán mặt hàng đang xem — khớp `BranchRevenueEntity` phía Dart. */
export class MobileRevenueBranchDto {
  @ApiProperty({ description: 'Id chi nhánh (`invoices.branch_id`)' })
  id!: string;

  @ApiProperty({ description: 'Tên chi nhánh; chi nhánh đã xoá thì là chính id' })
  name!: string;

  @ApiProperty({ description: 'Số lượng bán ròng của mặt hàng tại chi nhánh' })
  quantity!: number;

  @ApiProperty({ description: 'Doanh thu ròng của mặt hàng tại chi nhánh, đơn vị đồng' })
  revenue!: number;
}

/**
 * Màn "doanh thu theo chi nhánh" của MỘT mặt hàng. `item` là tiêu đề + tổng:
 * `quantity`/`revenue` của nó bằng Σ `data`, để màn con đọc tổng do server
 * chốt thay vì tự cộng. Tra ở catalogue nên mặt hàng chưa phát sinh trong kỳ
 * vẫn có tiêu đề (deep link), chỉ `data` rỗng.
 */
export class MobileRevenueItemBranchesDto {
  @ApiProperty({ type: MobileRevenueItemDto })
  item!: MobileRevenueItemDto;

  @ApiProperty({ type: [MobileRevenueBranchDto], description: 'Sắp doanh thu giảm dần' })
  data!: MobileRevenueBranchDto[];
}

/** Một BIẾN THỂ (item) của mẫu mã đang xem — khớp `ProductVariantRevenueEntity` phía Dart. */
export class MobileRevenueVariantDto {
  @ApiProperty({ format: 'uuid', description: 'Id item' })
  id!: string;

  @ApiProperty({ description: 'Mã item (SKU), snapshot trên dòng hoá đơn' })
  code!: string;

  @ApiProperty({ description: 'Tên item, snapshot trên dòng hoá đơn' })
  name!: string;

  @ApiProperty({ description: 'Doanh thu ròng của biến thể trong kỳ, đơn vị đồng' })
  revenue!: number;
}

/**
 * Tỉ trọng theo biến thể của MỘT mẫu mã. Với item lẻ (không thuộc mẫu mã)
 * `data` có đúng một dòng là chính nó.
 */
export class MobileRevenueItemVariantsDto {
  @ApiProperty({ type: MobileRevenueItemDto })
  item!: MobileRevenueItemDto;

  @ApiProperty({ type: [MobileRevenueVariantDto], description: 'Sắp doanh thu giảm dần' })
  data!: MobileRevenueVariantDto[];
}

/**
 * Tỉ trọng theo mặt hàng trong MỘT nhóm hàng. `category.revenue` = Σ `data`.
 * Không phân trang — một nhóm hàng có vài chục mẫu mã, và biểu đồ tròn cần
 * trọn tập.
 */
export class MobileRevenueCategoryItemsDto {
  @ApiProperty({ type: MobileRevenueCategoryDto })
  category!: MobileRevenueCategoryDto;

  @ApiProperty({ type: [MobileRevenueItemDto], description: 'Sắp doanh thu giảm dần' })
  data!: MobileRevenueItemDto[];
}

/**
 * Một mốc của chuỗi thời gian — khớp `TimeRevenueEntity` phía Dart.
 *
 * `start` là giờ TƯỜNG của người dùng (múi Asia/Ho_Chi_Minh, cùng múi session
 * Postgres) viết dạng `yyyy-MM-ddTHH:mm:ss`, CỐ Ý KHÔNG có offset/`Z`: app
 * parse nó thành `DateTime` giờ máy rồi đọc `.hour`/`.weekday`/`.day` để dựng
 * nhãn. Gắn `Z` vào là app chuyển sang giờ máy và mốc 0h thành 7h.
 *
 * Nghĩa của `start` theo mức: `hour` — ngày `from` lúc giờ đó; `weekday` —
 * ngày ĐẦU TIÊN trong kỳ có thứ đó, 00:00; `day` — 00:00 ngày đó; `week` —
 * thứ Hai đầu tuần ISO (có thể TRƯỚC `from`); `month` — ngày 1; `year` — 01/01.
 */
export class MobileRevenuePointDto {
  @ApiProperty({ example: '2026-09-01T09:00:00' })
  start!: string;

  @ApiProperty({ description: 'Doanh thu ròng của mốc, đơn vị đồng, có thể ÂM; mốc không phát sinh = 0' })
  revenue!: number;
}

/**
 * Chuỗi doanh thu theo thời gian của kỳ. `data` luôn ĐỦ mốc (24 giờ, 7 thứ,
 * mọi ngày/tuần/tháng/năm của kỳ) và tăng dần, mốc trống là 0 — biểu đồ cần
 * đủ số ô, và lấp ở server thì mọi bản app cùng vẽ một trục.
 */
export class MobileRevenueTimelineDto {
  @ApiProperty({ enum: MobileRevenueTimeUnit })
  unit!: MobileRevenueTimeUnit;

  @ApiProperty({ description: 'Tổng doanh thu của kỳ = Σ `data`, bằng `totalRevenue` của `items` cùng bộ lọc' })
  totalRevenue!: number;

  @ApiProperty({ type: [MobileRevenuePointDto] })
  data!: MobileRevenuePointDto[];
}
