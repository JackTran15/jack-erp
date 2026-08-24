import { ReportFilterOptionType } from '@erp/shared-interfaces';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Query params for the shared dropdown filter-options endpoint. */
export class ReportFilterOptionsQueryDto {
  /** Which dropdown to load (store, cashier, invoiceStatus, …). */
  @IsEnum(ReportFilterOptionType)
  type: ReportFilterOptionType;

  /** Optional case-insensitive partial search (dynamic types only). */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Pin the people lists (`cashier` / `salesperson`) to this branch, even for an
   * actor holding `iam.user.read.all`. POS sends its active branch; the chain
   * reports omit it and keep the consolidated view. Ignored by every other type.
   */
  @IsOptional()
  @IsUUID()
  branchId?: string;

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
