import { ApiProperty } from '@nestjs/swagger';

/**
 * Một nhóm hàng — khớp `ProductGroupEntity` phía Dart. Danh sách PHẲNG,
 * app dựng cây từ `parentId`: cây của tổ chức chỉ có hai tầng và màn chọn
 * của app đã có sẵn widget cho đúng hình dạng đó.
 */
export class MobileInventoryCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Nhóm cha; NULL = nhóm gốc. Cha ngừng hoạt động thì con thành gốc.',
  })
  parentId!: string | null;
}

/**
 * Một đơn vị tính — khớp `UnitEntity` phía Dart.
 *
 * Lấy từ `items.unit` (chuỗi tự do) chứ không từ bảng `inventory_units`: bộ
 * lọc tồn kho so `lower(items.unit)`, nên danh sách để chọn phải là những giá
 * trị ĐANG có trên hàng hoá, gộp không phân biệt hoa/thường (`Đôi` và `đôi` là
 * một dòng). `code` là dạng chữ thường — thứ gửi lên `unit` khi lọc — còn
 * `name` là một cách viết thật đang có để hiển thị.
 */
export class MobileInventoryUnitResponseDto {
  @ApiProperty({ description: 'Chữ thường của đơn vị, dùng để lọc' })
  code!: string;

  @ApiProperty({ description: 'Cách viết hiển thị' })
  name!: string;
}
