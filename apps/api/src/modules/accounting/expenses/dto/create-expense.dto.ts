import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsEnum,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ExpensePaymentMethod } from '../expense.entity';

export class CreateExpenseDto {
  @IsString()
  @MaxLength(2000)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsUUID()
  payableId?: string;

  /** Settlement method. CASH posts a cash movement + auto Phiếu chi on post. */
  @IsOptional()
  @IsEnum(ExpensePaymentMethod)
  paymentMethod?: ExpensePaymentMethod;

  /** Cash account to pay from — required when paymentMethod=CASH. */
  @ValidateIf((o) => o.paymentMethod === ExpensePaymentMethod.CASH)
  @IsUUID()
  cashAccountId?: string;
}
