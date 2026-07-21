import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelCashTransferDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
