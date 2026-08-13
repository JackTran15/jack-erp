import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  /**
   * Required even though the caller is authenticated: a stolen session must not
   * be enough to lock the real owner out of their own account.
   */
  @ApiProperty({ description: 'Mật khẩu hiện tại' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword: string;

  /** 72 is the bcrypt input limit — anything longer is silently truncated. */
  @ApiProperty({ description: 'Mật khẩu mới', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
