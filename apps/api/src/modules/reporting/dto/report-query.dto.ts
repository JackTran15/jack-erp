import { IsOptional, IsUUID, IsDateString, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DateRangeDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class ReportQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class AsyncReportDto {
  @IsIn([
    'sales-summary',
    'inventory-valuation',
    'receivables-aging',
    'payables-aging',
    'cash-reconciliation',
  ])
  type: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
