import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CashMovementType } from '../cash-movement.entity';

export class RecordCashMovementDto {
  @IsUUID()
  cashAccountId: string;

  @IsEnum(CashMovementType)
  type: CashMovementType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
