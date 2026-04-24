import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReceivableDto {
  @IsUUID()
  customerId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsDateString()
  dueDate: string;

  @IsUUID()
  accountId: string;
}
