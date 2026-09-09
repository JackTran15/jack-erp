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
import { CashPaymentsService } from './cash-payments.service';
import { CreateCashPaymentDto } from './dto/create-cash-payment.dto';
import { UpdateCashPaymentDto } from './dto/update-cash-payment.dto';
import { ReverseCashPaymentDto } from './dto/reverse-cash-payment.dto';
import { QueryCashPaymentDto } from './dto/query-cash-payment.dto';

@Controller('cash-payments')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashPaymentsController {
  constructor(private readonly service: CashPaymentsService) {}

  @Post()
  @RequirePermission('accounting.cash_payment.create')
  create(@Body() dto: CreateCashPaymentDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('accounting.cash_payment.read')
  list(@Query() query: QueryCashPaymentDto, @Actor() actor: ActorContext) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.cash_payment.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor);
  }

  @Get(':id/print-payload')
  @RequirePermission('accounting.cash_payment.read')
  getPrintPayload(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getPrintPayload(id, actor);
  }

  @Get(':id/export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('accounting.cash_payment.read')
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
  @RequirePermission('accounting.cash_payment.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashPaymentDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('accounting.cash_payment.delete')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.delete(id, actor);
  }

  @Post(':id/post')
  @RequirePermission('accounting.cash_payment.post')
  post(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.post(id, actor);
  }

  @Post(':id/reverse')
  @RequirePermission('accounting.cash_payment.reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseCashPaymentDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.reverse(id, dto.reason, actor);
  }
}
