import {
  ReportDefinition,
  ReportRegistry,
} from '../../reporting/report-core/report-definition';
import { InventoryReportSearchDto } from '../dto/inventory-report-search.dto';

/** Inventory-domain specialization of the generic report core. */
export type InventoryReportDefinition = ReportDefinition<InventoryReportSearchDto>;

/** Indexes the registered inventory report definitions by key (DI class token). */
export class InventoryReportRegistry extends ReportRegistry<InventoryReportDefinition> {}
