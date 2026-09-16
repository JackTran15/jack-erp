import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, IsEnum } from 'class-validator';

/** Sort of the debtor list. Absent = today's order (largest debt first, then name) — web unchanged. */
export enum CustomersWithDebtSort {
  NAME = 'name',
  DEBT_DESC = 'debtDesc',
  DEBT_ASC = 'debtAsc',
}

/** Lists customers that currently have outstanding debt (remaining_amount > 0). */
export class QueryCustomersWithDebtDto {
  /** Case-insensitive match against the customer name, code or phone. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CustomersWithDebtSort)
  sort?: CustomersWithDebtSort;

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
