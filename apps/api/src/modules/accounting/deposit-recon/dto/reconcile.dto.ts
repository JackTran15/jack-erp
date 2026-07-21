import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * One reconciliation batch: a bank statement always belongs to exactly one
 * deposit account, so the statement total and the discrepancy note are
 * per-account even when the user selected rows across several accounts.
 */
export class ReconcileGroupDto {
  @ApiProperty()
  @IsUUID()
  depositAccountId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  movementIds: string[];

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  stmtTotalAmount: number;

  /** Required when this group's statement total does not match (BR-REC-02). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/**
 * Reconcile deposit movements against bank statements (FR-09). Each group is
 * committed as its own batch — `systemTotalAmount = Σ net_amount` of that
 * group's movements is computed server-side, and a non-zero diff requires the
 * group's `note` (BR-REC-02). All groups share one transaction: if any group is
 * rejected, no batch is written.
 */
export class ReconcileDto {
  @ApiProperty({ type: [ReconcileGroupDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReconcileGroupDto)
  groups: ReconcileGroupDto[];

  @ApiProperty()
  @IsISO8601()
  stmtFromDate: string;

  @ApiProperty()
  @IsISO8601()
  stmtToDate: string;
}
