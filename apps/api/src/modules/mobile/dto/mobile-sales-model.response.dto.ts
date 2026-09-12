import { ApiProperty } from '@nestjs/swagger';

/** Một chiều biến thiên của mẫu mã và các nhãn nó nhận — vd `Màu sắc: D, BO`. */
export class MobileSalesModelAttributeDto {
  @ApiProperty({ description: 'Tên chiều — vd `Màu sắc`, `Size`' })
  name!: string;

  @ApiProperty({
    type: [String],
    description:
      'Các nhãn theo đúng thứ tự hiển thị đã cấu hình (`sort_order`), KHÔNG ' +
      'phải theo bảng chữ cái: `38, 39, 40` xếp theo alphabet vẫn đúng nhưng ' +
      '`S, M, L` thì không.',
  })
  options!: string[];
}

/** Nhãn mà một biến thể nhận ở MỘT chiều. */
export class MobileSalesVariantAttributeDto {
  @ApiProperty() name!: string;
  @ApiProperty() value!: string;
}

/**
 * Một biến thể bán được của mẫu mã.
 *
 * `id` LÀ `items.id`, khác hẳn `id` của mẫu mã bọc ngoài — đây chính là thứ
 * client cần để đặt vào dòng đơn hàng, và là lý do đường này tồn tại.
 */
export class MobileSalesVariantDto {
  @ApiProperty({ format: 'uuid', description: '`items.id` — khoá dòng đơn hàng' })
  id!: string;

  @ApiProperty() code!: string;
  @ApiProperty() name!: string;

  @ApiProperty({ nullable: true, description: 'Nhãn biến thể gộp sẵn — vd `39 · Nâu`' })
  variantLabel!: string | null;

  @ApiProperty() unit!: string;
  @ApiProperty({ description: '`0` là giá trị HỢP LỆ — hàng chưa đặt giá.' })
  sellingPrice!: number;

  @ApiProperty({
    type: [MobileSalesVariantAttributeDto],
    description:
      'Nhãn của biến thể ở từng chiều. Client dò TỔ HỢP người dùng chọn vào ' +
      'đây để tìm ra đúng biến thể — nên nó phải đủ MỌI chiều mà mẫu mã khai, ' +
      'không chỉ các chiều khác nhau giữa các biến thể.',
  })
  attributes!: MobileSalesVariantAttributeDto[];

  @ApiProperty({
    type: [String],
    description:
      'Mã vạch của biến thể. **MẢNG, không phải một chuỗi** — `item_barcodes` ' +
      'là quan hệ một-nhiều và KHÔNG có cờ `isPrimary`, nên không có cái nào ' +
      'là "mã vạch chính". Một mặt hàng thường mang cả EAN của nhà sản xuất ' +
      'lẫn mã nội bộ. Rỗng là ca hợp lệ và phổ biến. Thứ tự ổn định theo ' +
      '`created_at` rồi `code`, để hai lượt gọi không đảo chỗ.',
  })
  barcodes!: string[];
}

/**
 * Chi tiết một MẪU MÃ để bày bảng chọn biến thể của màn bán hàng.
 *
 * Đường này bù đúng chỗ hổng mà `viewBy=model` mở ra: ở mức mẫu mã, `id` là
 * `products.id` và **không đặt vào dòng đơn được**. Chạm một dòng mẫu mã thì
 * client gọi đường này, bày các chiều biến thiên thành chip, rồi dò tổ hợp
 * người dùng chọn ra một `variants[].id`.
 *
 * Vì sao KHÔNG dùng `GET pos/branches/:branchId/catalog/products/:id` dù nó trả
 * nhiều hơn: nó đòi quyền `inventory.read` — mở cả bề mặt kho — trong khi hai
 * vai bán hàng chỉ có `inventory.item.read`. Cùng lập luận đã khiến
 * `/mobile/sales-items` không dùng lại `/mobile/items`.
 */
export class MobileSalesModelDetailDto {
  @ApiProperty({ format: 'uuid', description: '`products.id`' })
  id!: string;

  @ApiProperty() code!: string;
  @ApiProperty() name!: string;

  @ApiProperty({ type: [MobileSalesModelAttributeDto] })
  attributes!: MobileSalesModelAttributeDto[];

  @ApiProperty({
    type: [MobileSalesVariantDto],
    description:
      'Chỉ các biến thể CÒN BÁN ĐƯỢC (`isActive` và `isPosVisible`) — cùng ' +
      'tập đã dựng nên dòng mẫu mã ở danh sách, nên hai màn không lệch nhau.',
  })
  variants!: MobileSalesVariantDto[];
}
