import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SubmitReconciliationDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualCash: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
