import { ReportGroupBy } from '@erp/shared-interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  DateRangeFilterDto,
  EnumFilterDto,
} from '../../../../common/filters/filter.dto';
import { StoreScopeDto } from './store-scope.dto';

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

  /** Multi-store consolidation scope; absent ⇒ actor's own branch. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreScopeDto)
  store?: StoreScopeDto;

  /** Multi-select invoice status; preferred over the single `status` below. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceStatus?: string[];

  /** Which date column the period filters on (default invoice_date). */
  @ApiPropertyOptional({ enum: ['invoice_date', 'created_date'] })
  @IsOptional()
  @IsIn(['invoice_date', 'created_date'])
  statDateType?: 'invoice_date' | 'created_date';

  /** Legacy single-status filter; kept for back-compat (use invoiceStatus). */
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
  statBy?: ReportGroupBy;

  /** revenue-by-item / per-line reports — filter by item category (Nhóm hàng hóa). */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** revenue-by-item only — filter by denormalized item brand (Thương hiệu). */
  @IsOptional()
  @IsString()
  brand?: string;

  /** revenue-by-item only — product kind filter. */
  @ApiPropertyOptional({ enum: ['product', 'service', 'combo'] })
  @IsOptional()
  @IsIn(['product', 'service', 'combo'])
  productType?: 'product' | 'service' | 'combo';

  /** Add a brand-grain split (daily-summary / revenue-by-item). */
  @IsOptional()
  @IsBoolean()
  statisticByBrand?: boolean;

  /** revenue-by-item only — split combo revenue across components. */
  @IsOptional()
  @IsBoolean()
  allocateComboRevenue?: boolean;
}
