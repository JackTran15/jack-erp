import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MobileRefreshDto {
  @ApiProperty({ description: 'Refresh token đã cấp ở lần đăng nhập trước' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
