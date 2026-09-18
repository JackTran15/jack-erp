import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * The dropdowns of the cash-fund filter dialog. Domain-local rather than added
 * to the shared `ReportFilterOptionType`: `employee`, `paymentMethod` and
 * `expenseCategory` mean something only here.
 */
export enum CashFundFilterOptionType {
  STORE = 'store',
  EMPLOYEE = 'employee',
  PAYMENT_METHOD = 'paymentMethod',
  EXPENSE_CATEGORY = 'expenseCategory',
}

/** Query params for the cash-fund filter-options endpoint. */
export class ReportFilterOptionsQueryDto {
  @IsEnum(CashFundFilterOptionType)
  type: CashFundFilterOptionType;

  /** Optional case-insensitive partial search. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
