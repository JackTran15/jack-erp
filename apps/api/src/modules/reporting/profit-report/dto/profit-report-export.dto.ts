import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import { ProfitReportSearchDto } from './profit-report-search.dto';

/**
 * Export/print request: the search request minus pagination.
 *
 * Exporting always covers the whole result set, so `page` and `limit` are
 * dropped rather than ignored — under `forbidNonWhitelisted` a caller that
 * sends them gets a 400 instead of silently exporting one page.
 */
export class ProfitReportExportDto extends OmitType(ProfitReportSearchDto, [
  'page',
  'limit',
] as const) {
  @ApiPropertyOptional({
    description:
      'Per-column display names the user renamed, keyed by column key. ' +
      'Columns left out keep their catalog label.',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  // `each: true` iterates arrays, not object values, so it cannot be used here.
  @IsOptional()
  @IsObject()
  columnLabels?: Record<string, string>;
}
