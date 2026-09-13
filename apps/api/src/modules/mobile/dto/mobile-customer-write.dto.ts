import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Gender } from '../../customer/customer.entity';
import { MobileCustomerStatus } from './mobile-customer-list.query.dto';

/**
 * Chuỗi rỗng / toàn khoảng trắng -> `null` TRƯỚC khi validate.
 *
 * `@IsOptional` chỉ bỏ qua `null`/`undefined`; một ô email để trống mà form
 * gửi `""` sẽ vấp `@IsEmail` và người dùng nhận "Email không đúng định dạng"
 * cho một ô họ không hề nhập. Nắn ở DTO để mọi client được đối xử như nhau.
 */
const blankToNull = () =>
  Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

/**
 * Body tạo khách hàng từ app. Message tiếng Việt vì app hiện thẳng `message`
 * của server lên toast — cùng lý do `MobileSupplierCreateDto` đã ghi.
 *
 * Cố ý KHÔNG nhận `groupId`, `nationalId`, `companyName`, `taxCode`,
 * `assignedStaffId`, `membershipCard`: form của app không có ô nào cho chúng.
 * Whitelist đang bật nên gửi tới là 400 — đúng ý, đừng nới "cho rộng".
 *
 * `code` để trống thì server tự cấp (`CustomerCodeService`), nên nó tuỳ chọn
 * ngay cả ở create — khác nhà cung cấp, nơi mã là bắt buộc.
 */
export class MobileCustomerCreateDto {
  @ApiPropertyOptional({
    maxLength: 50,
    description: 'Mã khách hàng; để trống thì hệ thống tự cấp',
  })
  @IsOptional()
  @IsString({ message: 'Mã khách hàng phải là chuỗi.' })
  @MaxLength(50, { message: 'Mã khách hàng tối đa 50 ký tự.' })
  code?: string;

  @ApiProperty({ maxLength: 200, description: 'Tên khách hàng' })
  @IsString({ message: 'Tên khách hàng phải là chuỗi.' })
  @IsNotEmpty({ message: 'Tên khách hàng không được để trống.' })
  @MaxLength(200, { message: 'Tên khách hàng tối đa 200 ký tự.' })
  name!: string;

  @ApiPropertyOptional({ maxLength: 30, nullable: true })
  @blankToNull()
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi.' })
  @MaxLength(30, { message: 'Số điện thoại tối đa 30 ký tự.' })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @blankToNull()
  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng.' })
  email?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @blankToNull()
  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi.' })
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự.' })
  address?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Ngày sinh dạng YYYY-MM-DD',
  })
  @blankToNull()
  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không đúng định dạng.' })
  birthDate?: string | null;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  @blankToNull()
  @IsOptional()
  @IsEnum(Gender, {
    message: 'Giới tính chỉ nhận "male", "female" hoặc "unspecified".',
  })
  gender?: Gender | null;

  @ApiPropertyOptional({ nullable: true })
  @blankToNull()
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi.' })
  note?: string | null;

  @ApiPropertyOptional({
    enum: MobileCustomerStatus,
    default: MobileCustomerStatus.ACTIVE,
    description: 'Vắng = active. Bản ghi mới bao giờ cũng đang theo dõi.',
  })
  @IsOptional()
  @IsIn(Object.values(MobileCustomerStatus), {
    message: 'Trạng thái chỉ nhận "active" hoặc "inactive".',
  })
  status?: MobileCustomerStatus;
}

export class MobileCustomerUpdateDto extends PartialType(
  MobileCustomerCreateDto,
) {}
