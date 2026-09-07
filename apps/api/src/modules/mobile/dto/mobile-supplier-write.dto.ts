import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ProviderType } from '../../inventory/location/provider.entity';

/**
 * Body của `POST /mobile/suppliers`.
 *
 * Gương ĐÚNG `MobileSupplierResponseDto` trừ `groupCode`: đọc ra trường nào thì
 * ghi vào được trường đó, nên `SupplierModel.toJson` phía Dart chỉ là bản đảo
 * của `fromJson` và không phải nhớ thêm luật nào.
 *
 * KHÔNG nhận `groupCode` ở đợt này: app chưa có danh mục nhóm thật (ô "Nhóm"
 * trong form đang chạy dữ liệu mock và đã bị vô hiệu hoá), mà nhận một mã nhóm
 * rồi tra `provider_groups` là dựng nửa tính năng chưa ai gọi. Khi có danh mục
 * thật thì thêm trường vào ĐÂY và thêm bước tra `groupId` trong service —
 * response đã trả sẵn `groupCode` nên phía Dart không phải đổi gì.
 *
 * KHÔNG nhận `email`, `notes`, `maxDebt`, `debtTermDays`, ngân hàng, liên hệ,
 * CMND, `isCustomer`: app không có ô nào cho chúng. `forbidNonWhitelisted` biến
 * mọi trường lạ thành 400 — đó chính là hàng rào giữ hai đầu không lệch nhau
 * âm thầm.
 */
export class MobileSupplierCreateDto {
  /**
   * BẮT BUỘC, cố ý khác web (web ẩn ô mã và để `DocumentNumberingService` sinh
   * `NCC000001`). Mã ở đây là dữ liệu người dùng đặt và KHÔNG suy được từ tên —
   * dữ liệu thật có `Ái Vân -> RBK`, `Đức Tàu (Tiến Thắng) -> TAU`. Form mobile
   * đã bắt buộc nhập, nên một request thiếu `code` là lỗi client và phải kêu,
   * chứ không được lặng lẽ sinh một mã mà người dùng không hề chọn.
   */
  @ApiProperty({
    maxLength: 50,
    description: 'Mã nhà cung cấp, duy nhất trong tổ chức',
  })
  @IsString({ message: 'Mã nhà cung cấp phải là chuỗi.' })
  @IsNotEmpty({ message: 'Mã nhà cung cấp không được để trống.' })
  @MaxLength(50, { message: 'Mã nhà cung cấp tối đa 50 ký tự.' })
  code!: string;

  @ApiProperty({ maxLength: 200, description: 'Tên nhà cung cấp' })
  @IsString({ message: 'Tên nhà cung cấp phải là chuỗi.' })
  @IsNotEmpty({ message: 'Tên nhà cung cấp không được để trống.' })
  @MaxLength(200, { message: 'Tên nhà cung cấp tối đa 200 ký tự.' })
  name!: string;

  /**
   * Nhận `status` chứ KHÔNG nhận `isActive`: đọc ra là `status` thì ghi vào
   * cũng phải là `status`, nếu không thì `SupplierModel` phía Dart phải nhớ hai
   * tên cho cùng một sự thật. Phép nắn sang cột `is_active` nằm đúng một chỗ,
   * trong service.
   *
   * Dùng `@IsIn` thay vì dựng enum mới: `MobileSupplierResponseDto.status` đã
   * viết đúng hai giá trị này dưới dạng union literal, thêm một enum song song
   * là hai nguồn cho một sự thật. `type` thì ngược lại — `ProviderType` đã có
   * sẵn trong entity nên `@IsEnum` mới là chỗ dựa đúng.
   */
  @ApiPropertyOptional({
    enum: ['active', 'inactive'],
    default: 'active',
    description: 'Vắng = active. Bản ghi mới bao giờ cũng đang theo dõi.',
  })
  @IsOptional()
  @IsIn(['active', 'inactive'], {
    message: 'Trạng thái chỉ nhận "active" hoặc "inactive".',
  })
  status?: 'active' | 'inactive';

  /**
   * Form mobile chưa có ô sửa loại hình nên luôn gửi giá trị của bản ghi (bản
   * mới là `organization`). Vẫn nhận ở đây để hợp đồng khép kín: mọi trường
   * `MobileSupplierResponseDto` trả ra đều ghi lại được.
   */
  @ApiPropertyOptional({
    enum: ProviderType,
    default: ProviderType.ORGANIZATION,
  })
  @IsOptional()
  @IsEnum(ProviderType, {
    message: 'Loại nhà cung cấp chỉ nhận "organization" hoặc "individual".',
  })
  type?: ProviderType;

  /**
   * Ba trường dưới nhận cả `null`. `@IsOptional()` của class-validator bỏ qua
   * cả `undefined` lẫn `null`, nên `null` đi lọt tới service — và service mới
   * là chỗ phân biệt "vắng khoá = giữ nguyên" với "null = xoá trắng".
   */
  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi.' })
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự.' })
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 30, nullable: true })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi.' })
  @MaxLength(30, { message: 'Số điện thoại tối đa 30 ký tự.' })
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 50, nullable: true })
  @IsOptional()
  @IsString({ message: 'Mã số thuế phải là chuỗi.' })
  @MaxLength(50, { message: 'Mã số thuế tối đa 50 ký tự.' })
  taxCode?: string | null;
}

/**
 * Body của `PATCH /mobile/suppliers/:id`. Mọi trường tuỳ chọn.
 *
 * `PartialType` của `@nestjs/swagger` (không phải `@nestjs/mapped-types`): nó
 * vừa nới validator thành `@IsOptional`, vừa giữ được schema trong `/docs`.
 *
 * CHO PHÉP đổi `code`: form mobile để ô mã sửa được, và `updateSupplier` phía
 * Dart khai rõ "mã cũ trên đường dẫn, mã mới trong body". Hệ quả là
 * `UQ_inventory_providers_org_code` có thể bị đụng ở đường update y như ở
 * đường create — service bắt `23505` cho CẢ HAI.
 *
 * KHÔNG kế thừa `OmitType(..., ['code'])`: bỏ `code` ở đây là chặn đúng thao
 * tác mà form đang mở cho người dùng.
 */
export class MobileSupplierUpdateDto extends PartialType(
  MobileSupplierCreateDto,
) {}
