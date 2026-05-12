import { IsNumber, IsOptional, Min } from 'class-validator';

export class SetStockThresholdDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQty?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxQty?: number | null;
}
