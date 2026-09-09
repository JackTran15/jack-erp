import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { DocumentColumn, ReportColumnDataType } from '@erp/shared-interfaces';
import type { Response } from 'express';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { ExportPipeline } from '../../../reporting/report-core/export/export-pipeline';
import { ExportDocumentHeader } from '../../../reporting/report-core/export/export.types';
import { HttpResponseSink } from '../../../reporting/report-core/export/http-response.sink';
import { XlsxStreamWriter } from '../../../reporting/report-core/export/xlsx-stream.writer';
import { assertUnderRowCap, MAX_REPORT_ROWS } from '../../../reporting/report-core/row-cap.util';
import {
  CashVoucherSearchV2Dto,
  CashVoucherSearchV2ResponseDto,
} from '../dto/cash-voucher-search-v2.dto';
import { CashVoucherExportFetcher } from '../queries/cash-voucher-export.fetcher';
import { SearchCashVouchersV2Query } from '../queries/search-cash-vouchers-v2.query';

/**
 * Upper bound on the number of rows one export streams.
 *
 * Same constant every export in the app checks against (`row-cap.util`), so
 * this route cannot drift from the shared cap by picking its own number.
 */
const EXPORT_ROW_CAP = MAX_REPORT_ROWS;

/** Columns kept in the export, in the same order the treasury grid renders them. */
const EXPORT_COLUMNS: DocumentColumn[] = [
  { col: 'createdAt', label: 'Ngày tạo', type: ReportColumnDataType.DATE },
  { col: 'documentNumber', label: 'Số chứng từ', type: ReportColumnDataType.STRING },
  { col: 'documentKind', label: 'Loại chứng từ', type: ReportColumnDataType.STRING },
  { col: 'status', label: 'Trạng thái', type: ReportColumnDataType.STRING },
  { col: 'totalAmount', label: 'Tổng tiền', type: ReportColumnDataType.CURRENCY },
  { col: 'counterparty', label: 'Đối tượng nộp/nhận', type: ReportColumnDataType.STRING },
  { col: 'personName', label: 'Người nộp/nhận', type: ReportColumnDataType.STRING },
  { col: 'reason', label: 'Lý do', type: ReportColumnDataType.STRING },
];

const EXPORT_HEADER: ExportDocumentHeader = {
  title: 'Danh sách thu chi tiền mặt',
  branch: null,
  subtitleLines: [],
};

/**
 * Resolves to `POST /v2/cash-vouchers/search` (URI versioning is global in
 * main.ts). One endpoint over both voucher tables, replacing the two separate
 * list calls the treasury grid used to merge client-side.
 */
@Controller('cash-vouchers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashVoucherV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  // Reuses the receipt read permission rather than introducing a new key, which
  // would 403 every existing role until RBAC granted it.
  @RequirePermission('accounting.cash_receipt.read')
  @ApiOperation({ summary: 'Search cash receipts and payments as one list' })
  @ApiOkResponse({ type: CashVoucherSearchV2ResponseDto })
  search(
    @Body() dto: CashVoucherSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<CashVoucherSearchV2ResponseDto> {
    return this.queryBus.execute(new SearchCashVouchersV2Query(dto, actor));
  }

  /**
   * Exports the exact same search as `search()` above: same DTO, same query,
   * same handler — so the file can never show something other than what the
   * grid displayed for that filter (ADR-06).
   *
   * `@Post` defaults to 201; the blob download on the frontend and the e2e
   * suite both expect 200, so it is set explicitly.
   */
  @Post('export')
  @Version('2')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('accounting.cash_receipt.read')
  @ApiOperation({ summary: 'Export the merged cash voucher list as .xlsx' })
  async export(
    @Body() dto: CashVoucherSearchV2Dto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    // The row cap must be enforced before the response opens: once
    // `writer.begin` runs, the first byte is already on the wire and a 400 is
    // no longer possible (export-pipeline.ts). `total` counts every matching
    // row regardless of the `limit` passed here, so a cheap 1-row fetch is
    // enough to read it.
    const preview: CashVoucherSearchV2ResponseDto = await this.queryBus.execute(
      new SearchCashVouchersV2Query({ ...dto, page: 1, limit: 1 }, actor),
    );
    assertUnderRowCap(preview.total, 'cash vouchers');

    const fetcher = new CashVoucherExportFetcher(
      this.queryBus,
      dto,
      actor,
      EXPORT_ROW_CAP,
    );
    await new ExportPipeline(
      fetcher,
      new XlsxStreamWriter('Thu chi tiền mặt'),
      new HttpResponseSink(res, 'thu-chi-tien-mat'),
    ).run(EXPORT_HEADER, EXPORT_COLUMNS);
  }
}
