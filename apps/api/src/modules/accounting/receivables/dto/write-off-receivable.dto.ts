import { IsString, MaxLength } from 'class-validator';

export class WriteOffReceivableDto {
  @IsString()
  @MaxLength(1000)
  reason: string;
}
