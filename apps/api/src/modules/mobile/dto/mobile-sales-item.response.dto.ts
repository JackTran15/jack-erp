import { ApiProperty } from '@nestjs/swagger';

/**
 * Một hàng hoá để BÁN — **một BIẾN THỂ**, kèm GIÁ BÁN.
 *
 * Đường thứ ba nói về hàng hoá, và nó tồn tại vì hai đường kia đều thiếu đúng
 * một thứ mà màn bán hàng cần:
 *
 * | | `/mobile/products` | `/mobile/items` | `/mobile/sales-items` |
 * |---|---|---|---|
 * | một dòng là | một MẪU MÃ | một BIẾN THỂ | một BIẾN THỂ |
 * | `id` dùng làm khoá dòng được? | **không** — hỗn hợp `products.id`/`items.id` | có | có |
 * | giá trả về | giá bán TRUNG BÌNH của mẫu mã | giá **NHẬP** | giá **BÁN** |
 * | phục vụ | màn danh mục | màn lập phiếu kho | **màn bán hàng** |
 *
 * Vì sao KHÔNG thêm `sellingPrice` vào `/mobile/items` cho gọn: đường đó phục
 * vụ người lập phiếu KHO, và `mobile-item.service.spec.ts` có một test mang tên
 * *"trả ĐÚNG năm trường — không rò giá bán, cân nặng, chất liệu"* khoá đúng
 * điều đó lại. Đảo một quyết định đã có test đặt tên bảo vệ, chỉ để tiết kiệm
 * một query, là đổi sai hướng.
 *
 * Vì sao KHÔNG dùng `/mobile/products` dù nó CÓ giá bán: `id` của nó là hỗn hợp
 * `products.id` / `items.id` tuỳ dòng, nên không dereference được bằng một
 * mình nó — mà dòng của một đơn hàng cần đúng `items.id`. Cùng lý do đã khiến
 * `/mobile/items` ra đời cho phiếu kho.
 *
 * **KHÔNG trả `purchasePrice`.** Giá vốn không phải thứ nhân viên bán hàng cần,
 * và đây là đường phục vụ họ — cùng luật mà `/mobile/products` đang giữ.
 */
export class MobileSalesItemResponseDto {
  @ApiProperty({
    enum: ['item', 'model'],
    description:
      '`item` = một biến thể, `id` là `items.id` và đặt thẳng vào dòng đơn ' +
      'được. `model` = một mẫu mã, `id` là `products.id` và **KHÔNG** đặt vào ' +
      'dòng đơn được — phải chọn một biến thể trước.',
  })
  type!: 'item' | 'model';

  @ApiProperty({
    format: 'uuid',
    description:
      '`items.id` khi `type=item`, `products.id` khi `type=model`. Ý nghĩa đổi ' +
      'theo `type`, nên đừng dereference nó mà không đọc `type` trước.',
  })
  id!: string;

  @ApiProperty({ description: 'Mã SKU' })
  code!: string;

  @ApiProperty({ description: 'Tên hàng hoá, đã kèm nhãn biến thể — vd `Giày Gelli (39 · Nâu)`' })
  name!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Nhãn biến thể tách riêng (`39 · Nâu`). NULL với mặt hàng không có biến thể.',
  })
  variantLabel!: string | null;

  @ApiProperty({ description: 'Đơn vị tính, dùng để hiển thị và làm `uomCode` của dòng đơn.' })
  unit!: string;

  @ApiProperty({
    description:
      'Giá bán của hàng hoá, đơn vị đồng. `0` là giá trị HỢP LỆ — hàng chưa ' +
      'đặt giá — và app vẫn phải hiển thị nó chứ không ẩn đi. Với `type=model` ' +
      'là giá TRUNG BÌNH của các biến thể, cùng phép tính mà `/mobile/products` ' +
      'và lưới `/admin/inventory-items` đang dùng.',
  })
  sellingPrice!: number;

  @ApiProperty({
    description:
      'Số biến thể gộp trong dòng. Luôn `1` khi `type=item`. Client dùng nó để ' +
      'biết có phải mở bảng chọn biến thể hay không.',
  })
  variantCount!: number;
}

export class MobileSalesItemPageDto {
  @ApiProperty({ type: [MobileSalesItemResponseDto] })
  data!: MobileSalesItemResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
