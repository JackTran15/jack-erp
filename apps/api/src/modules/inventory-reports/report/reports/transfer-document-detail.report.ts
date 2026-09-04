import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  INVENTORY_REPORT_KEYS,
  InventoryReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
  TransferLeg,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { resolvePeriod } from '../../services/date-range-resolver';
import {
  TransferDetailRow,
  TransferDetailService,
} from '../../services/transfer-detail.service';
import { InventoryReportDefinition } from '../inventory-report-definition';
import {
  buildInventoryHeaders,
  InventoryColumnDef,
  numericKeys,
} from '../inventory-report-column.util';
import { CountedRows } from '../../../reporting/report-core/report-definition';
import { assertKnownColumns, projectRows, toTotalsRow } from '../report-data.util';
import { permittedBranchIds } from '../report-scope.util';

const { STRING, NUMBER, DATE, CURRENCY } = ReportColumnDataType;

export const TRANSFER_DETAIL_COLUMNS: InventoryColumnDef[] = [
  { key: 'date', type: DATE, width: 120 },
  { key: 'documentNumber', type: STRING, width: 130 },
  { key: 'referenceDate', type: DATE, width: 150 },
  { key: 'reference', type: STRING, width: 130 },
  { key: 'warehouse', type: STRING, width: 150 },
  { key: 'sku', type: STRING, width: 150 },
  { key: 'name', type: STRING, width: 240 },
  { key: 'unit', type: STRING, width: 100 },
  { key: 'qty', type: NUMBER, width: 100 },
  { key: 'unitPrice', type: CURRENCY, width: 120 },
  { key: 'value', type: CURRENCY, width: 130 },
  { key: 'parentSku', type: STRING, width: 140 },
  { key: 'parentName', type: STRING, width: 160 },
  { key: 'group', type: STRING, width: 150 },
  { key: 'counterparty', type: STRING, width: 180 },
  { key: 'notes', type: STRING, width: 220 },
];

/**
 * Summing unit prices is not a total. Everything else in the catalog either
 * describes the document or is additive, and `toTotalsRow` nulls anything the
 * engine has no total for anyway.
 */
export const NON_ADDITIVE = new Set(['unitPrice']);

/** Only two measures are additive here; the rest describe the document. */
export const TRANSFER_DETAIL_KEY_MAP: Record<string, string> = {
  qty: 'qty',
  value: 'value',
};

/**
 * Resolve and authorise the ordered branch pair for a transfer detail query.
 *
 * Shared by the document-detail and difference-detail reports so the two can
 * never drift on who is allowed to see what. Lives outside `buildData` because
 * `countRows` — reached from the export path — must not be able to skip it.
 */
export async function resolveTransferPair(
  dto: InventoryReportSearchDto,
  actor: ActorContext,
  branches: Repository<BranchEntity>,
) {
  const filters = dto.filters;
  const period = resolvePeriod({
    preset: filters.period?.from || filters.period?.to ? undefined : filters.preset,
    startDate: filters.period?.from,
    endDate: filters.period?.to,
  });

  const sourceBranchId = filters.sourceStoreId;
  const destinationBranchId = filters.receivingStoreIds?.[0];
  if (!sourceBranchId || !destinationBranchId) {
    throw new BadRequestException(
      'filters.sourceStoreId and filters.receivingStoreIds[0] are both required',
    );
  }

  // The anchor is the branch whose row was clicked, so that is the one the
  // actor must be able to see. The counterpart only has to be in the same
  // organization — a branch manager can legitimately see who they shipped to.
  const anchor =
    filters.transferLeg === 'in' ? destinationBranchId : sourceBranchId;
  if (!permittedBranchIds(actor).has(anchor)) {
    throw new ForbiddenException(`Access denied for stores: ${anchor}`);
  }

  const owned = await branches.find({
    where: [
      { id: sourceBranchId, organizationId: actor.organizationId },
      { id: destinationBranchId, organizationId: actor.organizationId },
    ],
    select: { id: true },
  });
  if (owned.length !== 2) {
    throw new BadRequestException(
      `Unknown store ids: ${[sourceBranchId, destinationBranchId].join(', ')}`,
    );
  }

  return { ...period, sourceBranchId, destinationBranchId };
}

/** Rows of a transfer detail engine result, projected to the catalog shape. */
export function toTransferDetailRow(r: TransferDetailRow): ReportRow {
  return {
    date: r.date,
    documentNumber: r.documentNumber,
    referenceDate: r.referenceDate,
    reference: r.reference,
    warehouse: r.warehouse,
    counterparty: r.counterparty,
    notes: r.notes,
    sku: r.sku,
    name: r.name,
    unit: r.unit,
    qty: r.qty,
    unitPrice: r.unitPrice,
    value: r.value,
    parentSku: r.parentSku,
    parentName: r.parentName,
    group: r.group,
  };
}

/**
 * "Chi tiết phiếu nhập xuất điều chuyển theo cửa hàng và chứng từ" — L2.
 *
 * Dialog-only, opened from one of the three quantity cells on L1. Which leg is
 * primary comes from `filters.transferLeg`; the client decides the direction,
 * because only it knows which column was clicked.
 */
@Injectable()
export class TransferDocumentDetailReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.TRANSFER_DOCUMENT_DETAIL;

  constructor(
    private readonly transferDetail: TransferDetailService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
  ) {}

  private readonly catalogKeys = new Set(
    TRANSFER_DETAIL_COLUMNS.map((c) => c.key),
  );
  private readonly numeric = numericKeys(TRANSFER_DETAIL_COLUMNS);

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(
      // Ghim hai cột: cuộn ngang trên lưới nhiều cột thì mất luôn danh tính
      // của dòng. `getStart("left")` của TanStack tự cộng dồn offset nên
      // danh sách này nhận bao nhiêu khoá cũng được.
      buildInventoryHeaders(this.key, TRANSFER_DETAIL_COLUMNS, [
        'date',
        'documentNumber',
      ]),
    );
  }

  /**
   * `unmatched` is rejected here rather than silently accepted: it has its own
   * report key so the export filename says "chênh lệch", and letting this one
   * serve it would produce a file whose name contradicts its contents.
   */
  private legOf(dto: InventoryReportSearchDto): TransferLeg {
    const leg = dto.filters.transferLeg ?? 'out';
    if (leg === 'unmatched') {
      throw new BadRequestException(
        'transferLeg=unmatched belongs to inventory-transfer-difference-detail',
      );
    }
    return leg;
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, this.catalogKeys);
    const scope = await resolveTransferPair(dto, actor, this.branches);

    const result = await this.transferDetail.detail({
      organizationId: actor.organizationId,
      ...scope,
      leg: this.legOf(dto),
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
      leg: this.legOf(dto),
      page: 1,
      pageSize: 1,
    });
    return { total: result.total, subject: 'rows' };
  }
}
