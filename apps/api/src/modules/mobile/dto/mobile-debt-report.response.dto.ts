import { ApiProperty } from '@nestjs/swagger';

/**
 * Một KHÁCH HÀNG trong báo cáo công nợ — khớp `CustomerDebtEntity` phía Dart.
 *
 * Chỉ có `closing` chứ không đủ bốn cột đầu kỳ / tăng / giảm / cuối kỳ của
 * web: màn app hiện bày đúng MỘT con số mỗi khách, và thêm ba cột khi chưa ai
 * đọc là dựng sẵn thứ chưa dùng. CTE bên service vẫn giữ `opening`/`period`
 * tách nhau, nên ngày cần thì thêm ba cột là ba dòng SQL, không đổi hợp đồng.
 *
 * Giữ tên `closing` (không phải `debt`) để đọc đúng nghĩa sổ cái — cùng từ
 * với `debtClosing` của web — và để ba cột kia, khi có, đứng cạnh nó đọc ra
 * ngay là cùng một bộ.
 */
export class MobileCustomerDebtDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Mã khách hàng, vd KH000017' })
  code!: string;

  @ApiProperty()
  name!: string;

  /**
   * Số điện thoại, để BẤM GỌI ngay trên dòng — không phải để hiển thị.
   *
   * Màn công nợ của app giấu nút gọi sau cử chỉ vuốt, và nếu không có số ở đây
   * thì nút đó phải gọi thêm một lượt `/mobile/customers/:id` chỉ để lấy một
   * chuỗi. Bảng `customers` đã nằm trong `JOIN` sẵn có nên đây là một cột thêm,
   * không phải một phép nối thêm.
   *
   * `null` = khách chưa từng nhập số, KHÔNG phải lỗi dữ liệu.
   */
  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({
    description:
      'Nợ CUỐI KỲ = đầu kỳ + tăng − giảm, gộp sổ POS và sổ kế toán, đơn vị đồng. Có thể ÂM (khách trả dư) hoặc 0',
  })
  closing!: number;
}

/**
 * Trang khách hàng. `totalClosing` là của TOÀN tập khớp bộ lọc + từ khoá, không
 * phải của trang — cùng lý do `MobileRevenueItemPageDto` nêu: thanh "Tổng nợ"
 * đứng trên một danh sách cuộn vô tận, cộng các trang đã nạp là ra một con số
 * đổi theo lượt cuộn.
 */
export class MobileCustomerDebtPageDto {
  @ApiProperty({ type: [MobileCustomerDebtDto] })
  data!: MobileCustomerDebtDto[];

  @ApiProperty({ description: 'Tổng số khách có phát sinh trong sổ, không phải số dòng của trang' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'Tổng nợ cuối kỳ toàn tập, đơn vị đồng, có thể ÂM' })
  totalClosing!: number;
}
