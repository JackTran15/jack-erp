import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  INVENTORY_VALUE_PERMISSION,
  InvoiceReportColumnsResult,
} from '@erp/shared-interfaces';
import { RbacService } from '../../rbac/rbac.service';
import { withoutValueColumns } from '../report/inventory-report-column.util';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { GetInventoryReportColumnsQuery } from './get-inventory-report-columns.query';

@QueryHandler(GetInventoryReportColumnsQuery)
export class GetInventoryReportColumnsHandler
  implements IQueryHandler<GetInventoryReportColumnsQuery>
{
  constructor(
    private readonly registry: InventoryReportRegistry,
    private readonly rbac: RbacService,
  ) {}

  async execute({
    reportType,
    actor,
    filters,
  }: GetInventoryReportColumnsQuery): Promise<InvoiceReportColumnsResult> {
    const def = this.registry.get(reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${reportType}`);
    }
    const [catalog, canSeeValue] = await Promise.all([
      def.buildColumns(actor, filters),
      this.rbac.hasPermission(
        actor.userId,
        actor.organizationId,
        INVENTORY_VALUE_PERMISSION,
      ),
    ]);
    return {
      summaryLabel: 'Tổng',
      // Dropped from the catalog, not just hidden on screen: the client builds
      // its column picker from this, so a column the user may not read must not
      // be offerable.
      columns: withoutValueColumns(catalog, def.valueColumns, canSeeValue),
    };
  }
}
