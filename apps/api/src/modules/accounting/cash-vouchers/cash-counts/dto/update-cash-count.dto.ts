import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { DenominationDto } from './denomination.dto';

/** Update a DRAFT cash count (cash_account is fixed at creation). */
export class UpdateCashCountDto {
  @IsOptional()
  @IsISO8601()
  countedAt?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualAmount?: number;

  /** "Mục đích" — free-text purpose of the count. */
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DenominationDto)
  denominations?: DenominationDto[];
}
