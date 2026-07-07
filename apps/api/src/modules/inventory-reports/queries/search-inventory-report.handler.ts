import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InventoryReportResult } from '@erp/shared-interfaces';
import { CacheService } from '../../redis/cache.service';
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
  ) {}

  async execute({
    dto,
    actor,
  }: SearchInventoryReportQuery): Promise<InventoryReportResult> {
    const def = this.registry.get(dto.reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }
    return this.cache.getOrSet(
      CACHE_NAMESPACE,
      searchCacheKey(actor.organizationId, dto),
      () => def.buildData(dto, actor),
      CACHE_TTL_SECONDS,
    );
  }
}
