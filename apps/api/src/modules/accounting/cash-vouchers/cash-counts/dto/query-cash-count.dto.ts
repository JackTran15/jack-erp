import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CashCountStatus } from '../../enums';

export class QueryCashCountDto {
  @IsOptional()
  @IsEnum(CashCountStatus)
  status?: CashCountStatus;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
