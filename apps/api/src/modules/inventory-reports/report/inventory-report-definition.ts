import {
  InventoryReportStatBy,
  InventoryReportViewMode,
  ReportColumnHeader,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  ReportDefinition,
  ReportRegistry,
} from '../../reporting/report-core/report-definition';
import { InventoryReportSearchDto } from '../dto/inventory-report-search.dto';

/**
 * The request context a column catalog may depend on. Only `stock-summary`
 * reads these today: the chain view has no location, and the parent/category
 * grains leave most identity columns empty.
 */
export interface InventoryReportColumnsFilterDto {
  viewMode?: InventoryReportViewMode;
  statBy?: InventoryReportStatBy;
}

/**
 * Inventory-domain specialization of the generic report core.
 *
 * `buildColumns` widens the core contract with an OPTIONAL second `filters`
 * parameter — every other report ignores it (TS lets an implementation declare
 * fewer parameters than the interface), which mirrors how the invoice domain
 * widened the same method.
 */
export interface InventoryReportDefinition
  extends ReportDefinition<InventoryReportSearchDto> {
  buildColumns(
    actor: ActorContext,
    filters?: InventoryReportColumnsFilterDto,
  ): Promise<ReportColumnHeader[]>;
}

/** Indexes the registered inventory report definitions by key (DI class token). */
export class InventoryReportRegistry extends ReportRegistry<InventoryReportDefinition> {}
