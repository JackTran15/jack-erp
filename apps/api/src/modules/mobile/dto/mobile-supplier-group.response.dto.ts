import { ApiProperty } from '@nestjs/swagger';

/**
 * Một nhóm nhà cung cấp trên đường `/mobile/supplier-groups`.
 *
 * **Khoá cha là `parentGroupId`, KHÔNG phải `parentId`.** Nhánh nhóm HÀNG HOÁ
 * (`MobileInventoryCategoryResponseDto`) trả `parentId` trong khi đường GHI của
 * chính nó đọc `parentGroupId` — một lệch tên có thật mà phía Dart phải nhớ.
 * Nhánh nhà cung cấp bắt đầu từ con số 0 nên dùng thẳng tên cột ở cả hai chiều.
 * Đừng "đồng bộ" nó sang `parentId` cho giống nhánh kia.
 *
 * Trả CẢ [code] lẫn [name] vì nhãn hiển thị phía app là `MÃ - TÊN VIẾT HOA`
 * (`SupplierGroupEntity.label`) — thiếu một trong hai là app phải nạp thêm một
 * lượt chỉ để dựng một chuỗi.
 */
export class MobileSupplierGroupResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Khoá định danh, bất biến' })
  id!: string;

  @ApiProperty({
    maxLength: 50,
    description: 'Mã nhóm, duy nhất trong tổ chức. SỬA ĐƯỢC — không phải khoá',
  })
  code!: string;

  @ApiProperty({ maxLength: 200 })
  name!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Nhóm cha; null = nhóm gốc',
  })
  parentGroupId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({
    description:
      'false = ngừng theo dõi. Vẫn trả về để app tra được nhãn của nhóm ' +
      'đang gắn, nhưng app tự loại khỏi danh sách CHỌN',
  })
  isActive!: boolean;
}

/**
 * Thân của `GET /mobile/supplier-groups`.
 *
 * Danh sách **PHẲNG, KHÔNG phân trang** — app tự dựng cây từ `parentGroupId`.
 * Bảng `provider_groups` vốn phẳng nên dựng cây ở server là thêm một lượt biến
 * đổi mà phía Dart lại duỗi phẳng ngay khi nhận.
 *
 * Bọc trong `{ data: [...] }` chứ không trả mảng trần: mọi đường `/mobile/*`
 * khác đều có phong bì, và thêm khoá sau này (vd `total`) không phá `fromJson`.
 */
export class MobileSupplierGroupListDto {
  @ApiProperty({ type: [MobileSupplierGroupResponseDto] })
  data!: MobileSupplierGroupResponseDto[];
}
