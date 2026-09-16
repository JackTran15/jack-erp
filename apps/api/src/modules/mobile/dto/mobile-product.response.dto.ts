import { ApiProperty } from '@nestjs/swagger';

/**
 * Một dòng hàng hoá theo hình dạng app mobile đọc được.
 *
 * Một dòng là một MẪU MÃ, không phải một biến thể: nguồn là CTE `combined`
 * (`search-inventory-items-v2.handler.ts`) gộp các item cùng `product_id` lại
 * và lấy giá trung bình — đúng thứ trang web `/admin/inventory-items` đang
 * hiện, nên hai bên không lệch nhau. Item không thuộc mẫu mã nào tự đứng
 * thành một dòng.
 *
 * BỐN trường, khớp đúng ba dòng chữ mà màn hình vẽ (tên / mã / giá) cộng khoá
 * định danh. Cố ý KHÔNG trả:
 *
 * - `purchasePrice` — giá vốn, cùng loại dữ liệu nhạy cảm mà
 *   `MobileSupplierResponseDto` đã bỏ `maxDebt` để tránh rò.
 * - `barcode`, `brand`, `isPosVisible`, `isActive`, `itemCount` — app không
 *   hiển thị.
 * - `unit` — thêm lại khi màn chọn hàng hoá của phiếu kho bỏ dữ liệu giả
 *   (`ItemMock` phía Dart) và chuyển sang gọi API này.
 * - `type` (`'product' | 'orphan'`) — từng dự tính thêm khi có màn chi tiết,
 *   nhưng KHÔNG cần: `GET /mobile/products/:id` tra `id` trên chính CTE này
 *   nên tự biết dòng đó là mẫu mã hay item lẻ. Client chỉ cầm `id`.
 *
 * Cả bốn đều là thay đổi CỘNG THÊM, không phá client cũ. Màn chi tiết có DTO
 * riêng (`MobileProductDetailResponseDto`) chứ không mở rộng class này.
 */
export class MobileProductResponseDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Khoá định danh dòng: id của mẫu mã, hoặc id của item nếu nó không thuộc mẫu mã nào',
  })
  id!: string;

  @ApiProperty({ description: 'Mã hàng hoá (SKU), duy nhất trong tổ chức' })
  code!: string;

  @ApiProperty({ description: 'Tên hàng hoá' })
  name!: string;

  @ApiProperty({
    description:
      'Giá bán. Với mẫu mã có nhiều biến thể thì là giá trung bình của các biến thể',
  })
  sellingPrice!: number;

  @ApiProperty({
    nullable: true,
    description:
      'URL ảnh bìa (ảnh đầu tiên). `null` khi chưa có ảnh hoặc kho lưu trữ chưa cấu hình',
  })
  thumbnailUrl!: string | null;
}

/** Một trang hàng hoá. `limit` chứ không phải `pageSize` — gương theo `/mobile/suppliers`. */
export class MobileProductPageDto {
  @ApiProperty({ type: [MobileProductResponseDto] })
  data!: MobileProductResponseDto[];

  @ApiProperty({
    description: 'Tổng số bản ghi khớp, không phải số bản ghi của trang',
  })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
