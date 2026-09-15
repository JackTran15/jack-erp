import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Chuỗi rỗng -> `undefined`; cùng helper với `mobile-catalog-write.dto.ts`. */
const blankToUndefined = () =>
  Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

/**
 * Body tạo NHÓM NHÀ CUNG CẤP từ app — `POST /mobile/supplier-groups`.
 *
 * Gương đúng `MobileSupplierGroupResponseDto` trừ `id` (server sinh) và
 * `isActive`.
 *
 * **KHÔNG nhận `isActive`:** `SupplierGroupFormPage` chỉ có bốn ô (mã, tên,
 * nhóm cha, mô tả). Cột có `default: true`, và phơi trường này ra là mời client
 * bịa một chính sách thứ hai — cùng lập luận đã ghi ở `MobileUnitCreateDto`.
 */
export class MobileSupplierGroupCreateDto {
  /**
   * **BẮT BUỘC** — khác `MobileItemCategoryCreateDto` nơi `code` tuỳ chọn.
   *
   * `PROVIDER_GROUP_ENTITY_CONFIG` khai `{ key: 'code', required: true }`, cột
   * `code` là NOT NULL, và form app đã bắt nhập. Quan trọng hơn:
   * `ProviderGroupCrudService` KHÔNG gọi `DocumentNumberingService`, nên không
   * ai sinh mã hộ — để trống là request chết ở tầng driver (`23502`) và trả
   * **500** thay cho một câu 400 đọc được.
   */
  @ApiProperty({ maxLength: 50, description: 'Mã nhóm, duy nhất trong tổ chức' })
  @IsString({ message: 'Mã nhóm nhà cung cấp phải là chuỗi.' })
  @IsNotEmpty({ message: 'Mã nhóm nhà cung cấp không được để trống.' })
  @MaxLength(50, { message: 'Mã nhóm nhà cung cấp tối đa 50 ký tự.' })
  code!: string;

  @ApiProperty({ maxLength: 200, description: 'Tên nhóm nhà cung cấp' })
  @IsString({ message: 'Tên nhóm nhà cung cấp phải là chuỗi.' })
  @IsNotEmpty({ message: 'Tên nhóm nhà cung cấp không được để trống.' })
  @MaxLength(200, { message: 'Tên nhóm nhà cung cấp tối đa 200 ký tự.' })
  name!: string;

  /**
   * Nhóm cha. `null` ĐƯỢC PHÉP và mang nghĩa "nhóm gốc" — picker của app cho
   * bỏ chọn nhóm cha bằng cách chạm lại card đang chọn, nên đây là thao tác có
   * thật chứ không phải ca biên.
   *
   * `@IsOptional()` bỏ qua cả `undefined` lẫn `null`, nên `null` đi lọt xuống
   * service. Service mới là chỗ phân biệt "vắng khoá = giữ nguyên" với
   * "`null` = đưa lên gốc" — xem `MobileSupplierGroupService.update`.
   */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @blankToUndefined()
  @IsOptional()
  @IsUUID('4', { message: 'Nhóm cha không hợp lệ.' })
  parentGroupId?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, description: 'Mô tả' })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi.' })
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string | null;
}

/**
 * Body của `PATCH /mobile/supplier-groups/:id`.
 *
 * `PartialType` của `@nestjs/swagger` (KHÔNG phải `@nestjs/mapped-types`) —
 * cùng lý do đã ghi ở `MobileSupplierUpdateDto`: chỉ bản này giữ được metadata
 * Swagger của lớp cha.
 *
 * Tồn tại vì app CÓ màn sửa nhóm: `supplier_group_routes.dart` đăng ký nhánh
 * `edit/:id` dùng chung `SupplierGroupFormPage`, nạp sẵn bốn giá trị cũ.
 */
export class MobileSupplierGroupUpdateDto extends PartialType(
  MobileSupplierGroupCreateDto,
) {}
