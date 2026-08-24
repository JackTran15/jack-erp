import { IsString, IsOptional, IsEmail, IsEnum, MinLength, MaxLength } from 'class-validator';
import { BranchStatus } from '@erp/shared-interfaces';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Tên cửa hàng phải có ít nhất 2 ký tự.' })
  @MaxLength(200, { message: 'Tên cửa hàng tối đa 200 ký tự.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Mã cửa hàng tối đa 30 ký tự.' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự.' })
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Số điện thoại tối đa 30 ký tự.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email?: string;

  @IsOptional()
  @IsEnum(BranchStatus, { message: 'Trạng thái cửa hàng không hợp lệ.' })
  status?: BranchStatus;
}
