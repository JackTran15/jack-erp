import { ReportGroupBy } from '@erp/shared-interfaces';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  DateRangeFilterDto,
  EnumFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Scope filters applied PRE-aggregate (SQL level), mirroring the existing search APIs.
 * `issuedAt` is structurally optional so the same DTO can back templates (which may
 * omit a date range); the search handler enforces it is present at query time.
 */
export class InvoiceReportFilterDto {
  /** Report period — enforced present by the search handler. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  issuedAt?: DateRangeFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  type?: EnumFilterDto;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Optional person filters (used by per-line reports; absent = all). */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Cashier — matches invoice.staffId. */
  @IsOptional()
  @IsUUID()
  cashierId?: string;

  /** Salesperson — matches invoice.salespersonId. */
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  /** revenue-by-item only — row grain (default item). */
  @IsOptional()
  @IsEnum(ReportGroupBy)
  groupBy?: ReportGroupBy;

  /** revenue-by-item only — filter by item category (Nhóm hàng hóa). */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** revenue-by-item only — filter by denormalized item brand (Thương hiệu). */
  @IsOptional()
  @IsString()
  brand?: string;
}
