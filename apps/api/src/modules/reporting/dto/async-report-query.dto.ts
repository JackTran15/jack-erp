import { IsIn, IsOptional, IsUUID, IsDateString } from 'class-validator';

export const ASYNC_REPORT_TYPES = [
  'sales-summary',
  'inventory-valuation',
  'receivables-aging',
  'payables-aging',
  'cash-reconciliation',
] as const;

export type AsyncReportType = (typeof ASYNC_REPORT_TYPES)[number];

export class AsyncReportQueryDto {
  @IsIn(ASYNC_REPORT_TYPES)
  type: AsyncReportType;

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
