import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CASH_FUND_TIME_BUCKETS, CashFundKind, CashFundTimeBucket } from '@erp/shared-interfaces';
import { DateRangeFilterDto } from '../../../../common/filters/filter.dto';
import { StoreScopeDto } from './store-scope.dto';

/**
 * Scope filters applied PRE-aggregate for cash-fund reports. Structurally
 * optional so the same DTO backs saved templates; each report definition
 * enforces what it needs (every one of the five requires `period`).
 *
 * Branch scope (A-14 / 03-logical-design ADR-01): the header-branch reports
 * (#2 situation, #4 by category, #6 by time) send `branchId`; the two ledgers
 * (#3, #5) send `store`. Both go through `resolveReportBranchIds`, which clamps
 * to the actor's assignments unless they hold `reporting.cash.consolidated.read`.
 */
export class CashFundReportFilterDto {
  /** Report period on the voucher date (ADR-02). */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  period?: DateRangeFilterDto;

  /** The header branch — reports that have no store picker. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Multi-store scope — "Bảng kê thu chi" and "Bảng kê tiền chi theo mục chi". */
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreScopeDto)
  store?: StoreScopeDto;

  /** Nhân viên thu/chi (`staff_id` on the voucher) — "Bảng kê thu chi". */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  /** Phương thức thanh toán = which fund: cash vouchers or deposit vouchers. */
  @ApiPropertyOptional({ enum: ['cash', 'deposit'] })
  @IsOptional()
  @IsIn(['cash', 'deposit'])
  paymentMethod?: CashFundKind;

  /**
   * Mục chi filter for the expense reports. Category ids, or the literal
   * `uncategorized` (CASH_FUND_UNCATEGORIZED) for lines without a category.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  /** Drill-down from a "Tiền cuối kỳ" cell of "Tình hình thu chi" into one fund's ledger. */
  @ApiPropertyOptional({ enum: ['cash', 'deposit'] })
  @IsOptional()
  @IsIn(['cash', 'deposit'])
  fundKind?: CashFundKind;

  /** "Thống kê theo" of "Chi tiền theo thời gian"; defaults to `day`. */
  @ApiPropertyOptional({ enum: CASH_FUND_TIME_BUCKETS })
  @IsOptional()
  @IsIn(CASH_FUND_TIME_BUCKETS as readonly string[])
  timeBucket?: CashFundTimeBucket;
}
