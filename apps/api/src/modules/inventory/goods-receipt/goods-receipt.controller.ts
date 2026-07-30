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
import { IsEnum, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import {
  GoodsReceiptPurpose,
  GoodsReceiptStatus,
} from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { ExportPipeline } from '../../reporting/report-core/export/export-pipeline';
import { HttpResponseSink } from '../../reporting/report-core/export/http-response.sink';
import { VoucherXlsxWriter } from '../../reporting/report-core/export/voucher-xlsx.writer';
import { StaticRowsFetcher } from '../../reporting/report-core/export/static-rows.fetcher';
import { voucherToReportDocument } from '../../reporting/report-core/export/voucher-export.adapter';
import { GoodsReceiptService } from './goods-receipt.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';

class GoodsReceiptQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GoodsReceiptStatus)
  status?: GoodsReceiptStatus;

  @IsOptional()
  @IsEnum(GoodsReceiptPurpose)
  purpose?: GoodsReceiptPurpose;

  @IsOptional()
  @IsString()
  branchId?: string;
}

@Controller('goods-receipts')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class GoodsReceiptController {
  constructor(private readonly service: GoodsReceiptService) {}

  @Post()
  @RequirePermission('goods_receipt.post')
  @RequireBranchScope()
  create(@Body() dto: CreateGoodsReceiptDto, @Actor() actor: ActorContext) {
    return this.service.createAndPost(dto, actor);
  }

  @Get()
  @RequirePermission('goods_receipt.read')
  @RequireBranchScope()
  list(@Query() query: GoodsReceiptQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      status: query.status,
      purpose: query.purpose,
      branchId: actor.branchId,
      organizationId: actor.organizationId,
    });
  }

  @Get(':id')
  @RequirePermission('goods_receipt.read')
  @RequireBranchScope()
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor);
  }

  @Get(':id/print-payload')
  @RequirePermission('goods_receipt.read')
  @RequireBranchScope()
  getPrintPayload(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getPrintPayload(id, actor);
  }

  @Get(':id/export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('goods_receipt.read')
  @RequireBranchScope()
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
      new HttpResponseSink(res, payload.title),
    ).run(doc.header, doc.columns);
  }

  @Patch(':id')
  @RequirePermission('goods_receipt.write')
  @RequireBranchScope()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoodsReceiptDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('goods_receipt.write')
  @RequireBranchScope()
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.service.cancel(id, actor);
  }

  @Post(':id/post')
  @RequirePermission('goods_receipt.post')
  @RequireBranchScope()
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.post(id, actor);
  }
}
