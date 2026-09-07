import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query options for the warehouse voucher detail routes (`GET /:id`), shared by
 * goods receipts and goods issues.
 *
 * Exists because the global ValidationPipe runs with `forbidNonWhitelisted`, so
 * an undeclared query param is a 400 rather than something quietly ignored.
 */
export class VoucherDetailQueryDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'Include the voucher lines. Defaults to true. Pass false when the caller ' +
      'pages the lines separately through GET /:id/lines — on a large voucher ' +
      'the lines are the only part of this payload that scales with size.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const v = String(value).toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    // Anything else passes through unchanged so @IsBoolean rejects it, rather
    // than being coerced into a silent default the caller never asked for.
    return value;
  })
  @IsBoolean()
  includeLines?: boolean;
}
