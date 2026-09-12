import { ApiProperty } from '@nestjs/swagger';

/**
 * Một khách hàng, ở hình dạng mà màn CHỌN KHÁCH của app cần — không hơn.
 *
 * Bốn trường, và đó là toàn bộ thứ `picker_customer_page` + `sell_customer_bar`
 * đọc tới. `CustomerEntity` của backend có hơn hai chục cột (điểm thưởng, hạng
 * thẻ, công nợ, ngày sinh, địa chỉ, ghi chú…) — đúng thứ một danh sách chọn
 * không cần và không nên phát tán ra thiết bị di động.
 *
 * **`phone` thì CÓ, khác `MobileCounterpartyResponseDto`.** Không phải thiếu
 * nhất quán: ở đó danh sách là nhà cung cấp/nhân viên cho phiếu kho, người dùng
 * nhận ra nhau bằng mã; ở đây người bán gõ SỐ ĐIỆN THOẠI để tìm khách và đọc nó
 * để xác nhận đúng người. Bỏ `phone` là bỏ chính khoá tra cứu của màn.
 */
export class MobileCustomerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true, description: 'Mã khách hàng. NULL là hợp lệ — khách vãng lai chưa có mã.' })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, description: 'Số điện thoại — khoá tra cứu chính của màn chọn khách.' })
  phone!: string | null;
}

export class MobileCustomerPageDto {
  @ApiProperty({ type: [MobileCustomerResponseDto] })
  data!: MobileCustomerResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
