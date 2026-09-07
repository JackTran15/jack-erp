import { ApiProperty } from '@nestjs/swagger';

/**
 * Một hàng hoá để thêm vào phiếu kho — **một BIẾN THỂ**, không phải mẫu mã.
 *
 * Đây là khác biệt cốt lõi với `MobileProductResponseDto`, và là lý do endpoint
 * này tồn tại: `/mobile/products` gộp các biến thể của một mẫu mã thành MỘT
 * dòng mang `products.id`. Dòng hàng của phiếu thì trỏ vào `items.id` bằng khoá
 * ngoại cứng — lấy id bên kia là vi phạm FK, và vi phạm KHÔNG ĐỀU: mặt hàng
 * không có mẫu mã cha thì id lại tình cờ đúng.
 *
 * Năm trường, đúng bộ mà một dòng hàng cần:
 *
 * - [id] -> `lines[].itemId`
 * - [unit] -> `lines[].uomCode` (server tự lấy, app không gửi)
 * - [purchasePrice] -> giá gợi ý điền sẵn vào ô đơn giá
 * - [code], [name] -> hai dòng chữ trên màn chọn
 *
 * `ItemEntity` gốc có ~35 cột (cân nặng, kích thước đóng gói, năm sản xuất,
 * chất liệu…). Không map tường minh là đẩy trọn chúng xuống máy người dùng.
 */
export class MobileItemResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Chính là `lines[].itemId` khi lập phiếu' })
  id!: string;

  @ApiProperty({ description: 'Mã SKU' })
  code!: string;

  @ApiProperty({ description: 'Tên hàng hoá, đã kèm nhãn biến thể — vd `Giày Gelli (39 · Nâu)`' })
  name!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Nhãn biến thể tách riêng (`39 · Nâu`). NULL với mặt hàng không có biến thể. ' +
      'Đi kèm [name] chứ không thay nó: màn chọn hiện tên ở dòng đầu và nhãn này ở dòng phụ.',
  })
  variantLabel!: string | null;

  @ApiProperty({ description: 'Đơn vị tính. Server dùng nó làm `uomCode` của dòng hàng.' })
  unit!: string;

  @ApiProperty({
    description:
      'Giá nhập mặc định của hàng hoá — điền sẵn vào ô đơn giá khi vừa chọn. ' +
      'Đây là NGOẠI LỆ có cơ sở với luật không-rò-giá-vốn của `/mobile/products`: ' +
      'người lập phiếu nhập buộc phải thấy và sửa được giá nhập.',
  })
  purchasePrice!: number;
}

export class MobileItemPageDto {
  @ApiProperty({ type: [MobileItemResponseDto] })
  data!: MobileItemResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
