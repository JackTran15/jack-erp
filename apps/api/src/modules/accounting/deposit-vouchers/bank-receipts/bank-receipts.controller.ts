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
import { BankReceiptsService } from './bank-receipts.service';
import { CreateBankReceiptDto } from './dto/create-bank-receipt.dto';
import { UpdateBankReceiptDto } from './dto/update-bank-receipt.dto';
import { ReverseBankReceiptDto } from './dto/reverse-bank-receipt.dto';
import { QueryBankReceiptDto } from './dto/query-bank-receipt.dto';

@Controller('bank-receipts')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class BankReceiptsController {
  constructor(private readonly service: BankReceiptsService) {}

  @Post()
  @RequirePermission('accounting.bank_receipt.create')
  create(@Body() dto: CreateBankReceiptDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('accounting.bank_receipt.read')
  list(@Query() query: QueryBankReceiptDto, @Actor() actor: ActorContext) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.bank_receipt.read')
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor);
  }

  @Get(':id/print-payload')
  @RequirePermission('accounting.bank_receipt.read')
  getPrintPayload(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getPrintPayload(id, actor);
  }

  @Get(':id/export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('accounting.bank_receipt.read')
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
  @RequirePermission('accounting.bank_receipt.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankReceiptDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('accounting.bank_receipt.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.delete(id, actor);
  }

  @Post(':id/post')
  @RequirePermission('accounting.bank_receipt.post')
  post(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.post(id, actor);
  }

  @Post(':id/reverse')
  @RequirePermission('accounting.bank_receipt.reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseBankReceiptDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.reverse(id, dto.reason, actor);
  }
}
