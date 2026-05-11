import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsEnum,
  MaxLength,
  Min,
} from 'class-validator';
import { CashAccountType } from '../cash-account.entity';

export class CreateCashAccountDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsEnum(CashAccountType)
  type: CashAccountType;

  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  balance?: number;
}
