import { BadRequestException } from '@nestjs/common';
import { ReportTemplateColumn } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ReportTemplateColumnDto } from './dto/report-template-column.dto';
import { ReportRegistry } from './report-definition';

/**
 * Full set of accepted column keys for a report type — its catalog (fixed
 * registry columns, per actor). Validation is per `reportType` so every
 * report's own column set is honored.
 */
export async function buildColumnCatalog(
  registry: ReportRegistry,
  reportType: string,
  actor: ActorContext,
): Promise<Set<string>> {
  const def = registry.get(reportType);
  if (!def) {
    throw new BadRequestException(`Unknown report type: ${reportType}`);
  }
  return new Set((await def.buildColumns(actor)).map((h) => h.col));
}

/** Reject any key not present in the catalog. */
export function assertColumnsInCatalog(
  keys: string[],
  catalog: Set<string>,
): void {
  const unknown = keys.filter((k) => !catalog.has(k));
  if (unknown.length) {
    throw new BadRequestException(
      `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
    );
  }
}

/**
 * Validate + normalize the column records: every `col` must be in the catalog,
 * no duplicate keys, at least one visible. `order` is stamped from array
 * position (client input ignored) and `displayName` is trimmed (blank ⇒ null).
 */
export function normalizeTemplateColumns(
  cols: ReportTemplateColumnDto[],
  catalog: Set<string>,
): ReportTemplateColumn[] {
  assertColumnsInCatalog(
    cols.map((c) => c.col),
    catalog,
  );

  const keys = cols.map((c) => c.col);
  if (new Set(keys).size !== keys.length) {
    throw new BadRequestException('Duplicate report columns');
  }

  const normalized: ReportTemplateColumn[] = cols.map((c, i) => ({
    col: c.col,
    displayName: c.displayName?.trim() ? c.displayName.trim() : null,
    visible: c.visible ?? true,
    frozen: c.frozen ?? false,
    order: i,
  }));
  if (!normalized.some((c) => c.visible)) {
    throw new BadRequestException('At least one column must be visible');
  }
  return normalized;
}
