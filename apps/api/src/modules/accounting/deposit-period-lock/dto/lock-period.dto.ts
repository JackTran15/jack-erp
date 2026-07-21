import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';

/**
 * Lock a branch's deposit-fund books for a period (FR-12). `force` overrides
 * the BR-REC-04 stale-unreconciled warning (server has no separate
 * `blockOnStaleUnreconciled` config — an explicit `force` from the caller is
 * the override).
 */
export class LockPeriodDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty({ description: 'YYYY-MM', example: '2026-06' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be YYYY-MM' })
  period: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
