import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Reconcile a batch of deposit movements against a bank statement total
 * (FR-09). `systemTotalAmount = Σ net_amount` of the selected movements is
 * computed server-side; a non-zero diff requires `note` (BR-REC-02).
 */
export class ReconcileDto {
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

  @ApiProperty()
  @IsISO8601()
  stmtFromDate: string;

  @ApiProperty()
  @IsISO8601()
  stmtToDate: string;

  /** Required when the statement total does not match the system total (BR-REC-02). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
