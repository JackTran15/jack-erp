import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Chuỗi rỗng -> `undefined`; lý do đầy đủ ở `mobile-product-write.dto.ts`. */
const blankToUndefined = () =>
  Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

/**
 * Body tạo ĐƠN VỊ TÍNH từ app — `POST /mobile/inventory/units`.
 *
 * **ĐÚNG HAI trường, và đó là ràng buộc từ màn hình.** `UnitFormPage` của app
 * cố ý chỉ có `Tên` + `Mô tả`; tỉ lệ quy đổi và đơn vị gốc thuộc về màn "Đơn vị
 * chuyển đổi" (chúng là thuộc tính của một hàng hoá cụ thể, không phải của
 * danh mục đơn vị). Whitelist đang bật nên gửi thêm khoá là 400 — đúng ý.
 *
 * `isActive` cũng KHÔNG nhận: đơn vị vừa tạo luôn đang theo dõi, và app không
 * có ô nào để chọn khác đi. `UnitOfMeasureCrudService` tự điền mặc định `true`.
 */
export class MobileUnitCreateDto {
  @ApiProperty({ maxLength: 50, description: 'Tên đơn vị tính, vd "Đôi"' })
  @IsString({ message: 'Tên đơn vị tính phải là chuỗi.' })
  @IsNotEmpty({ message: 'Tên đơn vị tính không được để trống.' })
  @MaxLength(50, { message: 'Tên đơn vị tính tối đa 50 ký tự.' })
  name!: string;

  @ApiPropertyOptional({ description: 'Diễn giải' })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Diễn giải phải là chuỗi.' })
  @MaxLength(1000, { message: 'Diễn giải tối đa 1000 ký tự.' })
  description?: string;
}

/**
 * Body tạo NHÓM HÀNG HOÁ từ app — `POST /mobile/item-categories`.
 *
 * Bốn trường, khớp đúng `ProductGroupFormPage`. KHÔNG nhận `status`: nhóm vừa
 * tạo luôn `ACTIVE`, và app không có ô nào chọn khác. KHÔNG nhận `commissions`:
 * hoa hồng theo nhóm là nghiệp vụ của backoffice, app không bày nó ở đâu cả.
 *
 * `parentGroupId` dùng đúng TÊN của cột backend chứ không phải `parentId` như
 * `MobileInventoryCategoryResponseDto` đang trả về ở đường đọc. Lệch tên này có
 * thật và cố ý giữ: `ItemCategoryCrudService` đọc `parentGroupId`, và đổi tên ở
 * đây để "cho đồng bộ" nghĩa là nhóm cha lặng lẽ bị bỏ qua — whitelist gỡ khoá
 * lạ trước khi service kịp nhìn thấy nó.
 */
export class MobileItemCategoryCreateDto {
  @ApiProperty({ maxLength: 200, description: 'Tên nhóm hàng' })
  @IsString({ message: 'Tên nhóm hàng phải là chuỗi.' })
  @IsNotEmpty({ message: 'Tên nhóm hàng không được để trống.' })
  @MaxLength(200, { message: 'Tên nhóm hàng tối đa 200 ký tự.' })
  name!: string;

  @ApiPropertyOptional({ maxLength: 50, description: 'Mã nhóm hàng' })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Mã nhóm hàng phải là chuỗi.' })
  @MaxLength(50, { message: 'Mã nhóm hàng tối đa 50 ký tự.' })
  code?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id nhóm cha' })
  @blankToUndefined()
  @IsOptional()
  @IsUUID('4', { message: 'Nhóm cha không hợp lệ.' })
  parentGroupId?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Diễn giải' })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Diễn giải phải là chuỗi.' })
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự.' })
  description?: string;
}
