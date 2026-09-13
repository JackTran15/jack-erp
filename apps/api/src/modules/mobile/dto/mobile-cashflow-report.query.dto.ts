import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MobileRevenueReportQueryDto } from './mobile-revenue-report.query.dto';

/**
 * Chiều tiền của màn "theo cửa hàng". Giá trị là chữ thường vì app dùng
 * `CashflowKind.name` (enum Dart) vừa làm slug đường dẫn vừa làm giá trị query
 * — cùng cách `MobileRevenueTimeUnit` khớp `name` của enum phía Dart.
 */
export enum MobileCashflowKind {
  INCOME = 'income',
  EXPENSE = 'expense',
}

/**
 * Kỳ + phạm vi cửa hàng của báo cáo thu chi — kế thừa nguyên `from`/`to` BẮT
 * BUỘC và `branchIds` của báo cáo doanh thu, như `MobileCustomerDebtListQueryDto`
 * kế thừa chéo.
 *
 * Kỳ tính theo `created_at` của `cash_movements` — sổ quỹ không có ngày chứng
 * từ, và đó cũng là cột mà "Sổ chi tiết tiền mặt" của web dùng cho cả mốc kỳ
 * lẫn thứ tự dòng. `to` tính TRỌN ngày cuối.
 */
export class MobileCashflowReportQueryDto extends MobileRevenueReportQueryDto {}

export class MobileCashflowStoresQueryDto extends MobileCashflowReportQueryDto {
  @ApiProperty({ enum: MobileCashflowKind, example: MobileCashflowKind.INCOME })
  @IsEnum(MobileCashflowKind)
  kind!: MobileCashflowKind;
}
