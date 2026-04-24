import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCashAccountDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  balance?: number;
}
