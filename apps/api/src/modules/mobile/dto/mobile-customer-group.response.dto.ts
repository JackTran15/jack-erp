import { ApiProperty } from '@nestjs/swagger';

/**
 * Một nhóm khách hàng trên đường `/mobile/customer-groups`.
 *
 * **PHẲNG tuyệt đối — KHÔNG có `parentGroupId`.** Đây là khác biệt cốt lõi với
 * `MobileSupplierGroupResponseDto`, và nó đến từ chính lược đồ: bảng
 * `customer_groups` không có cột tự trỏ, trong khi `provider_groups` có. Ai
 * quen nhánh nhà cung cấp sẽ định "thêm cho đồng bộ" — đừng, ở đây không có gì
 * để trỏ tới.
 *
 * **Cũng KHÔNG có `isActive`**: bảng không có cột đó, nên mọi nhóm đều chọn
 * được. Nhánh nhà cung cấp có, và vì thế màn chọn bên đó phải lọc; màn chọn bên
 * này thì không.
 *
 * [code] do server cấp (`NKHxxxxxx` qua `DocumentNumberingService`) và
 * **NULLABLE** — các nhóm tạo trước migration `AddCustomerGroupCode` có thể
 * chưa được backfill. App hiện `name` là chính, `code` chỉ là dòng phụ.
 */
export class MobileCustomerGroupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Mã nhóm do server cấp, dạng NKHxxxxxx; null nếu chưa backfill',
  })
  code!: string | null;

  @ApiProperty({ maxLength: 100, description: 'Duy nhất trong một tổ chức' })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
}

/**
 * Thân của `GET /mobile/customer-groups`.
 *
 * Danh sách **PHẲNG, KHÔNG phân trang** — bảng nhóm khách hàng nhỏ và picker
 * cần trọn danh mục trong một lượt.
 *
 * Bọc `{ data: [...] }` chứ không trả mảng trần: mọi đường `/mobile/*` khác đều
 * có phong bì, và thêm khoá sau này không phá `fromJson`. Đây cũng là một lý do
 * viết endpoint mới thay vì dùng `/customers/groups` — đường đó trả mảng trần
 * kèm cả cột hạ tầng (`organizationId`, `createdBy`…).
 */
export class MobileCustomerGroupListDto {
  @ApiProperty({ type: [MobileCustomerGroupResponseDto] })
  data!: MobileCustomerGroupResponseDto[];
}
