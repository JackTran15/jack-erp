import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
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

  /** Required when type=TRANSFER (destination account). */
  @ValidateIf((o) => o.type === CashMovementType.TRANSFER)
  @IsUUID()
  toAccountId?: string;

  /** Required for DEPOSIT/WITHDRAWAL/ADJUSTMENT — the GL account that offsets the cash leg. */
  @ValidateIf((o) => o.type !== CashMovementType.TRANSFER)
  @IsUUID()
  contraAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
