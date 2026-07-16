import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  IsDateString,
} from 'class-validator';
import {
  DepositMovementType,
  DepositMovementSource,
  DepositTransferStatus,
} from '@erp/shared-interfaces';

/**
 * Internal DTO for DepositService.recordMovement / createAndPostInternal.
 * Not exposed on a controller in GĐ1 — driven by the POS auto-post consumer (DF-05)
 * and, later, the manual voucher services (GĐ2).
 */
export class RecordDepositMovementDto {
  @ApiProperty()
  @IsUUID()
  depositAccountId: string;

  @ApiPropertyOptional({ description: 'Destination account for TRANSFER' })
  @IsOptional()
  @IsUUID()
  toAccountId?: string;

  @ApiProperty({ enum: DepositMovementType })
  @IsEnum(DepositMovementType)
  type: DepositMovementType;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: 'Contra COA (required for DEPOSIT/WITHDRAWAL)' })
  @IsOptional()
  @IsUUID()
  contraAccountId?: string;

  @ApiProperty({ enum: DepositMovementSource })
  @IsEnum(DepositMovementSource)
  source: DepositMovementSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceRefId?: string;

  @ApiPropertyOptional({
    description:
      'Usually invoice_payments.id, but also carries non-UUID GĐ3 markers (FEE, <lineId>-REVERSAL)',
  })
  @IsOptional()
  @IsString()
  sourceRefLineId?: string;

  @ApiProperty({ description: 'Transaction date (original doc date, not sync date)' })
  @IsDateString()
  docDate: string;

  @ApiPropertyOptional({ description: 'Value date (settlement); populated in GĐ3' })
  @IsOptional()
  @IsDateString()
  valueDate?: string;

  @ApiPropertyOptional({ description: 'Acquirer fee (R1); defaults to 0 when omitted' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  feeAmount?: number;

  @ApiPropertyOptional({ description: 'amount − feeAmount (R1); defaults to amount when omitted' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  netAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNumber?: string;

  /** GĐ4 — links this movement to the other leg of an inter-branch transfer. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  transferPairId?: string;

  @ApiPropertyOptional({ enum: DepositTransferStatus })
  @IsOptional()
  @IsEnum(DepositTransferStatus)
  transferStatus?: DepositTransferStatus;
}
