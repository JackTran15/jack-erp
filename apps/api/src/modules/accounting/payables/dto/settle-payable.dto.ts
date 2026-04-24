import {
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';

export class SettlePayableDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @MaxLength(50)
  method: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @IsDateString()
  settlementDate?: string;
}
