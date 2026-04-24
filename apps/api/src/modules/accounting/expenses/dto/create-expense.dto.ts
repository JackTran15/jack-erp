import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

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
}
