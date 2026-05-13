import { IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';

export class SetStockThresholdDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  minQty?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  maxQty?: number | null;
}
