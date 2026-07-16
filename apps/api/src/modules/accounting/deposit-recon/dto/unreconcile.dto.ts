import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Undo a reconciliation (BR-PERM-03, Kế toán trưởng only) — by explicit
 * `movementIds` or by `batchId` (every movement in that batch). `reason` is
 * mandatory either way (NFR-05 audit).
 */
export class UnreconcileDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  movementIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
}
