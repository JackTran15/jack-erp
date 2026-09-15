import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Chuỗi rỗng -> `undefined`; cùng helper với `mobile-catalog-write.dto.ts`. */
const blankToUndefined = () =>
  Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

/**
 * Body tạo NHÓM KHÁCH HÀNG từ app — `POST /mobile/customer-groups`.
 *
 * **CỐ Ý KHÔNG nhận `code`** — và đây là khác biệt lớn nhất với
 * `MobileSupplierGroupCreateDto`, nơi mã là BẮT BUỘC. Nhóm khách hàng có mã do
 * server cấp qua `DocumentNumberingService` (`NKHxxxxxx`); nhận mã từ client là
 * phá bộ đếm đó và mở đường cho hai nhóm cùng mã. Form của app cũng không có ô
 * mã, đúng theo lược đồ.
 *
 * Whitelist đang bật nên gửi `code` tới là 400 — đúng ý.
 */
export class MobileCustomerGroupCreateDto {
  /**
   * BẮT BUỘC và **duy nhất trong một tổ chức** (`uq_customer_group_org_name`).
   *
   * Tên là khoá duy nhất thật sự của bảng này, khác nhánh nhà cung cấp nơi mã
   * giữ vai đó — nên trùng tên là 409, và service dịch sang câu tiếng Việt.
   */
  @ApiProperty({ maxLength: 100, description: 'Tên nhóm, duy nhất trong tổ chức' })
  @IsString({ message: 'Tên nhóm khách hàng phải là chuỗi.' })
  @IsNotEmpty({ message: 'Tên nhóm khách hàng không được để trống.' })
  @MaxLength(100, { message: 'Tên nhóm khách hàng tối đa 100 ký tự.' })
  name!: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Mô tả' })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi.' })
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;
}
