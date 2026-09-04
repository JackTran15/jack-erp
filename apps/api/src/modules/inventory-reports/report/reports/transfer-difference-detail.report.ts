import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  INVENTORY_REPORT_KEYS,
  InventoryReportResult,
  ReportColumnHeader,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { TransferDetailService } from '../../services/transfer-detail.service';
import { InventoryReportDefinition } from '../inventory-report-definition';
import {
  buildInventoryHeaders,
  numericKeys,
} from '../inventory-report-column.util';
import { CountedRows } from '../../../reporting/report-core/report-definition';
import { assertKnownColumns, projectRows, toTotalsRow } from '../report-data.util';
import {
  resolveTransferPair,
  toTransferDetailRow,
  TRANSFER_DETAIL_COLUMNS,
  TRANSFER_DETAIL_KEY_MAP,
  NON_ADDITIVE,
} from './transfer-document-detail.report';

/** L2's columns minus `warehouse` — see the label note in shared-interfaces. */
const COLUMNS = TRANSFER_DETAIL_COLUMNS.filter((c) => c.key !== 'warehouse');
const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));
const NUMERIC = numericKeys(COLUMNS);

/**
 * "Chi tiết chênh lệch điều chuyển" — L3.
 *
 * The issues from source to destination with no posted paired receipt. Because
 * `received` and `unmatched` partition `out` on the same predicate, the total
 * here equals the absolute value of the difference cell that opened it —
 * structurally, not by arithmetic that has to be kept in step.
 *
 * `leg` is hard-coded rather than read from the DTO: this report exists to give
 * the export file the right name ("chênh lệch"), and letting a filter redirect
 * it would defeat that.
 */
@Injectable()
export class TransferDifferenceDetailReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.TRANSFER_DIFFERENCE_DETAIL;

  constructor(
    private readonly transferDetail: TransferDetailService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(buildInventoryHeaders(this.key, COLUMNS, ['date']));
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
    const scope = await resolveTransferPair(dto, actor, this.branches);

    const result = await this.transferDetail.detail({
      organizationId: actor.organizationId,
      ...scope,
      leg: 'unmatched',
      page: dto.page ?? 1,
      pageSize: dto.limit ?? 20,
    });

    return {
      rows: projectRows(result.data.map(toTransferDetailRow), dto.columns),
      totals: toTotalsRow(
        dto.columns,
        result.totals,
        TRANSFER_DETAIL_KEY_MAP,
        NON_ADDITIVE,
      ),
      total: result.total,
    };
  }

  async countRows(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<CountedRows> {
    const scope = await resolveTransferPair(dto, actor, this.branches);
    const result = await this.transferDetail.detail({
      organizationId: actor.organizationId,
      ...scope,
      leg: 'unmatched',
      page: 1,
      pageSize: 1,
    });
    return { total: result.total, subject: 'rows' };
  }
}
