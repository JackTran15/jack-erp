import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { DenominationDto } from './denomination.dto';

export class CreateCashCountDto {
  @IsUUID()
  cashAccountId: string;

  @IsISO8601()
  countedAt: string;

  /** Counted physical cash (nhập tay). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualAmount: number;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Optional breakdown — when present, sum(denom*count) must equal actualAmount. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DenominationDto)
  denominations?: DenominationDto[];
}
