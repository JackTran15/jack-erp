import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Party kind for the cash-voucher partner picker. `ALL` merges the three. */
export enum PartnerLookupType {
  EMPLOYEE = 'employee',
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
  ALL = 'all',
}

export class QueryPartnerLookupDto {
  @IsEnum(PartnerLookupType)
  type: PartnerLookupType;

  /** Case-insensitive match against the party name or code. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}
