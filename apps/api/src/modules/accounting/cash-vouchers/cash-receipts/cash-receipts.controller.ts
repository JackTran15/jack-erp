import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
import { HttpResponseSink } from '../../../reporting/report-core/export/http-response.sink';
import { VoucherXlsxWriter } from '../../../reporting/report-core/export/voucher-xlsx.writer';
import { StaticRowsFetcher } from '../../../reporting/report-core/export/static-rows.fetcher';
import { voucherToReportDocument } from '../../../reporting/report-core/export/voucher-export.adapter';
import { CashReceiptsService } from './cash-receipts.service';
import { CreateCashReceiptDto } from './dto/create-cash-receipt.dto';
import { UpdateCashReceiptDto } from './dto/update-cash-receipt.dto';
import { ReverseCashReceiptDto } from './dto/reverse-cash-receipt.dto';
import { QueryCashReceiptDto } from './dto/query-cash-receipt.dto';

@Controller('cash-receipts')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashReceiptsController {
  constructor(private readonly service: CashReceiptsService) {}

  @Post()
  @RequirePermission('accounting.cash_receipt.create')
  create(@Body() dto: CreateCashReceiptDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('accounting.cash_receipt.read')
  list(@Query() query: QueryCashReceiptDto, @Actor() actor: ActorContext) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.cash_receipt.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor);
  }

  @Get(':id/print-payload')
  @RequirePermission('accounting.cash_receipt.read')
  getPrintPayload(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getPrintPayload(id, actor);
  }

  @Get(':id/export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('accounting.cash_receipt.read')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    const payload = await this.service.getPrintPayload(id, actor);
    const doc = voucherToReportDocument(payload);
    await new ExportPipeline(
      new StaticRowsFetcher(doc.rows, doc.totals),
      new VoucherXlsxWriter(payload),
      new HttpResponseSink(res, `${payload.title} ${payload.docNo}`),
    ).run(doc.header, doc.columns);
  }

  @Patch(':id')
  @RequirePermission('accounting.cash_receipt.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashReceiptDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('accounting.cash_receipt.delete')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.delete(id, actor);
  }

  @Post(':id/post')
  @RequirePermission('accounting.cash_receipt.post')
  post(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.post(id, actor);
  }

  @Post(':id/reverse')
  @RequirePermission('accounting.cash_receipt.reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseCashReceiptDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.reverse(id, dto.reason, actor);
  }
}
