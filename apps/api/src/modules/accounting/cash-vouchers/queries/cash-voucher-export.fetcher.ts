import { ReportRow } from '@erp/shared-interfaces';
import { QueryBus } from '@nestjs/cqrs';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { toBusinessDate } from '../../../../common/utils/business-timezone.util';
import { ExportFetcher, PushRows } from '../../../reporting/report-core/export/export.types';
import {
  CashVoucherRowDto,
  CashVoucherSearchV2Dto,
  CashVoucherSearchV2ResponseDto,
} from '../dto/cash-voucher-search-v2.dto';
import { SearchCashVouchersV2Query } from './search-cash-vouchers-v2.query';

/** Projects one merged voucher row onto the columns the export actually prints. */
function toRow(row: CashVoucherRowDto): ReportRow {
  return {
    createdAt: toBusinessDate(new Date(row.createdAt)),
    documentNumber: row.documentNumber,
    documentKind: row.documentKind,
    status: row.status,
    totalAmount: row.totalAmount,
    counterparty: row.counterparty,
    personName: row.personName,
    reason: row.reason,
  };
}

/**
 * Drains the merged cash voucher search in one call, capped at `limit` rows.
 *
 * Same `SearchCashVouchersV2Query` and `SearchCashVouchersV2Handler` the grid's
 * `/search` route uses (ADR-06) — only `page`/`limit` are overridden, to the
 * export row cap rather than whatever page the grid happened to be on. There is
 * no record-level cursor to page on here, so this mirrors `SingleShotFetcher`:
 * one call, one push.
 *
 * The cap value itself is not this file's concern (`SingleShotFetcher`'s doc
 * comment applies verbatim): the caller checks it against the total *before*
 * the response opens and only then hands this fetcher a `limit` already known
 * to cover every matching row.
 */
export class CashVoucherExportFetcher implements ExportFetcher {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly dto: CashVoucherSearchV2Dto,
    private readonly actor: ActorContext,
    private readonly limit: number,
  ) {}

  async drain(push: PushRows): Promise<ReportRow | null> {
    const result: CashVoucherSearchV2ResponseDto = await this.queryBus.execute(
      new SearchCashVouchersV2Query(
        { ...this.dto, page: 1, limit: this.limit },
        this.actor,
      ),
    );
    if (result.data.length) await push(result.data.map(toRow));
    return null;
  }
}
