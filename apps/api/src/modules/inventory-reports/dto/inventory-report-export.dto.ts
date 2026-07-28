import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import { InventoryReportSearchDto } from './inventory-report-search.dto';

/**
 * Export/print request: the search request minus pagination.
 *
 * Exporting always covers the whole result set, so `page` and `limit` are
 * dropped rather than ignored — under `forbidNonWhitelisted` a caller that
 * sends them gets a 400 instead of silently exporting one page.
 *
 * `columns` (inherited) already carries both the visible set and its order,
 * which is why the server never needs to read a saved template (ADR-04).
 */
export class InventoryReportExportDto extends OmitType(
  InventoryReportSearchDto,
  ['page', 'limit'] as const,
) {
  @ApiPropertyOptional({
    description:
      'Per-column display names the user renamed, keyed by column key. ' +
      'Columns left out keep their catalog label.',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  // `@IsString({ each: true })` would be wrong here: class-validator's `each`
  // iterates arrays, not object values, so it rejects every object. Values are
  // screened for stringhood where they are consumed instead.
  @IsOptional()
  @IsObject()
  columnLabels?: Record<string, string>;
}
