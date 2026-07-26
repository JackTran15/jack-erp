import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DuplicateVoucherDto {
  @ApiProperty({ description: 'New voucher code (must be unique within the organization) — vouchers have no auto-numbering, so the client must supply one' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
