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

/**
 * Một KHO (`storages`) của một cửa hàng — cho màn chọn "Kho" khi sửa dòng hàng.
 *
 * Hai trường, và cố ý không hơn. `GET /mobile/inventory/stores/:branchId` cũng
 * trả `storages` nhưng đó là endpoint BÁO CÁO TỒN KHO: nó đòi `asOf`/`kind` và
 * tính tồn cho từng kho. Bẻ một endpoint báo cáo thành nguồn cho màn chọn là
 * buộc hai màn không liên quan vào nhau — ngày báo cáo đổi tham số là màn chọn
 * gãy theo.
 */
export class MobileInventoryStorageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Tên kho' })
  name!: string;
}

/**
 * Một BIN (vị trí lưu kho) trong một kho.
 *
 * `isUnassigned` là bin ẢO "Chưa xếp" mà mỗi kho có đúng một cái: hàng đã nhập
 * kho nhưng chưa xếp lên kệ nằm ở đó. Nó **luôn đứng đầu danh sách**, nên app
 * không cần luật riêng để chọn giá trị mặc định — đúng thứ trang web đi tìm khi
 * nó không giải được kệ ưu tiên.
 */
export class MobileInventoryLocationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Mã vị trí, vd `A-01-03`' })
  code!: string;

  @ApiProperty({ description: 'Tên hiển thị' })
  name!: string;

  @ApiProperty({ description: 'Bin ảo "Chưa xếp" — mỗi kho một cái, luôn đứng đầu' })
  isUnassigned!: boolean;
}
