import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Cố ý KHÔNG dùng `@IsEmail()` / `@IsUUID()`. `LoginBloc` của app mobile không
 * có nhánh nào cho `BadRequestException` (nó rơi vào `LoginError.unknown`), nên
 * một validator chặt hơn chỉ đổi thông báo "Sai thông tin đăng nhập" thành
 * "Lỗi không xác định". Giá trị của DTO này là whitelist + schema trong /docs.
 */
export class MobileLoginDto {
  @ApiProperty({ description: 'Email đăng nhập' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: 'Mật khẩu' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  /** `format` chỉ ghi vào Swagger, không ép kiểu — xem chú thích đầu class. */
  @ApiProperty({ description: 'Id tổ chức (tenant)', format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}
