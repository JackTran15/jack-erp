import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  INVENTORY_VALUE_PERMISSION,
  InventoryReportResult,
} from '@erp/shared-interfaces';
import { CacheService } from '../../redis/cache.service';
import { RbacService } from '../../rbac/rbac.service';
import { withoutValueColumns } from '../report/inventory-report-column.util';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { searchCacheKey } from '../report/report-data.util';
import { SearchInventoryReportQuery } from './search-inventory-report.query';

const CACHE_NAMESPACE = 'inventory-reports';
const CACHE_TTL_SECONDS = 45;

@QueryHandler(SearchInventoryReportQuery)
export class SearchInventoryReportHandler
  implements IQueryHandler<SearchInventoryReportQuery>
{
  constructor(
    private readonly registry: InventoryReportRegistry,
    private readonly cache: CacheService,
    private readonly rbac: RbacService,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchInventoryReportQuery): Promise<InventoryReportResult> {
    const def = this.registry.get(dto.reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }
    const canSeeValue = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      INVENTORY_VALUE_PERMISSION,
    );
    // Narrow the request itself rather than the result: a saved template that
    // still names `outValue` then loses that one column instead of failing
    // `assertKnownColumns` with a 400. Doing it before the cache key is built
    // also keeps the two audiences on separate cache entries.
    const scoped = {
      ...dto,
      columns: withoutValueColumns(dto.columns, def.valueColumns, canSeeValue),
    };
    return this.cache.getOrSet(
      CACHE_NAMESPACE,
      searchCacheKey(actor.organizationId, actor.branchIds, scoped),
      () => def.buildData(scoped, actor),
      CACHE_TTL_SECONDS,
    );
  }
}
