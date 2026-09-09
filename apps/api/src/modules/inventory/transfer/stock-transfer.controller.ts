import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { TransferStatus, DocCounterpartyKind } from '@erp/shared-interfaces';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsISO8601,
  ValidateIf,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockTransferService } from './stock-transfer.service';
import { CreateIntraWarehouseTransferDto } from './create-intra-warehouse-transfer.dto';
import { ExportPipeline } from '../../reporting/report-core/export/export-pipeline';
import { HttpResponseSink } from '../../reporting/report-core/export/http-response.sink';
import { VoucherXlsxWriter } from '../../reporting/report-core/export/voucher-xlsx.writer';
import { StaticRowsFetcher } from '../../reporting/report-core/export/static-rows.fetcher';
import { voucherToReportDocument } from '../../reporting/report-core/export/voucher-export.adapter';
import { VoucherDetailQueryDto } from '../dto/voucher-detail-query.dto';

class TransferLineDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  sourceStorageId: string;

  @IsUUID()
  destinationStorageId: string;

  @IsOptional()
  @IsUUID()
  sourceLocationId?: string;

  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreateTransferDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  transporterUserId?: string;

  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @ValidateIf((o) => o.counterpartyKind !== undefined)
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsISO8601()
  transferredAt?: string;

  /**
   * Cho phép chuyển kho vượt tồn (kho xuất âm). Client gửi `true` sau khi người
   * dùng xác nhận cảnh báo "xuất quá số lượng tồn"; mặc định vẫn chặn.
   */
  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];
}

class TransferQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @IsOptional()
  @IsString()
  branchId?: string;
}

@Controller('inventory/stock/transfers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockTransferController {
  constructor(private readonly service: StockTransferService) {}

  @Post()
  @RequirePermission('inventory.transfer.create')
  create(@Body() dto: CreateTransferDto, @Actor() actor: ActorContext) {
    return this.service.createAndPost(dto, actor, {
      validateOnHand: !dto.allowNegative,
    });
  }

  @Patch(':id')
  @RequirePermission('inventory.transfer.create')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor, {
      allowNegative: dto.allowNegative,
    });
  }

  @Post('intra-warehouse')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  createIntraWarehouseTransfer(
    @Body() dto: CreateIntraWarehouseTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createIntraWarehouseTransferAndPost(dto, actor);
  }

  @Get()
  @RequirePermission('inventory.transfer.read')
  list(@Query() query: TransferQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({
      ...query,
      organizationId: actor.organizationId,
    });
  }

  @Get(':id')
  @RequirePermission('inventory.transfer.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: VoucherDetailQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor.organizationId, {
      includeLines: query.includeLines,
    });
  }

  @Get(':id/print-payload')
  @RequirePermission('inventory.transfer.read')
  getPrintPayload(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getPrintPayload(id, actor);
  }

  @Get(':id/export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventory.transfer.read')
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

  @Post(':id/post')
  @RequirePermission('inventory.transfer.post')
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.post(id, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.transfer.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.cancel(id, actor);
  }
}
