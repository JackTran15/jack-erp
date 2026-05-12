import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateItemBarcodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
