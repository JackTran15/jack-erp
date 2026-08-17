import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Res,
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
import { ExportPipeline } from '../../reporting/report-core/export/export-pipeline';
import { HttpResponseSink } from '../../reporting/report-core/export/http-response.sink';
import { VoucherXlsxWriter } from '../../reporting/report-core/export/voucher-xlsx.writer';
import { StaticRowsFetcher } from '../../reporting/report-core/export/static-rows.fetcher';
import { voucherToReportDocument } from '../../reporting/report-core/export/voucher-export.adapter';
import {
  DocCounterpartyKind,
  GoodsIssuePurpose,
  GoodsIssueStatus,
} from '@erp/shared-interfaces';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GoodsIssueService } from './goods-issue.service';

class GoodsIssueLineDto {
  @IsUUID()
  itemId: string;

  /** Per-line bin/location to issue from. Optional — falls back to the
   *  header locationId when omitted (POS sales, transfer flows). */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  /** Per-line unit price (e.g. selling price for SALE, cost for DISPOSAL).
   *  Optional — 0 is acceptable for purely qty-based movements. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreateGoodsIssueDto {
  @IsUUID()
  locationId: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  /** Đối tượng kind (supplier | customer). When set, the service validates the
   *  counterparty and routes supplier→provider_id, customer→counterparty cols. */
  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsEnum(GoodsIssuePurpose)
  purpose?: GoodsIssuePurpose;

  @IsOptional()
  @IsUUID()
  reasonId?: string;

  @IsOptional()
  @IsUUID()
  targetBranchId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Free-text deliverer name (Người giao). */
  @IsOptional()
  @IsString()
  deliverer?: string;

  /** FE-supplied reference codes shown as Tham chiếu. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  /** User-entered issue date+time; falls back to createdAt when omitted. */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsIssueLineDto)
  lines: GoodsIssueLineDto[];
}

/**
 * Fields an edit may touch. No `purpose`, no `targetBranchId` — changing
 * either changes what kind of document this is, which is a cancel-and-recreate,
 * not an edit (A-11).
 */
class UpdateGoodsIssueDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsUUID()
  reasonId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  deliverer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsIssueLineDto)
  lines?: GoodsIssueLineDto[];
}

class GoodsIssueQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GoodsIssueStatus)
  status?: GoodsIssueStatus;

  @IsOptional()
  @IsString()
  branchId?: string;
}

@Controller('inventory/goods-issues')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class GoodsIssueController {
  constructor(private readonly service: GoodsIssueService) {}

  @Post()
  @RequirePermission('inventory.goods-issue.create')
  @RequireBranchScope()
  create(@Body() dto: CreateGoodsIssueDto, @Actor() actor: ActorContext) {
    return this.service.createAndPost(dto, actor);
  }

  @Get()
  @RequirePermission('inventory.goods-issue.read')
  @RequireBranchScope()
  list(@Query() query: GoodsIssueQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({
      ...query,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
    });
  }

  @Get(':id')
  @RequirePermission('inventory.goods-issue.read')
  @RequireBranchScope()
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor);
  }

  @Get(':id/lines')
  @RequirePermission('inventory.goods-issue.read')
  @RequireBranchScope()
  getLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getLines(id, actor, query.page, query.pageSize);
  }

  @Get(':id/print-payload')
  @RequirePermission('inventory.goods-issue.read')
  @RequireBranchScope()
  getPrintPayload(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getPrintPayload(id, actor);
  }

  @Get(':id/export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventory.goods-issue.read')
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
  @RequirePermission('inventory.goods-issue.update')
  @RequireBranchScope()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoodsIssueDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Post(':id/post')
  @RequirePermission('inventory.goods-issue.post')
  @RequireBranchScope()
  post(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.post(id, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.goods-issue.cancel')
  @RequireBranchScope()
  cancel(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.cancel(id, actor);
  }
}
