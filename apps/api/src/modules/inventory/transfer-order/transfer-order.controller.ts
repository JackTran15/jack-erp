import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DocCounterpartyKind, TransferOrderStatus } from "@erp/shared-interfaces";
import {
  Actor,
  ActorContext,
} from "../../../common/decorators/actor-context.decorator";
import { RequireBranchScope, RequirePermission } from "../../auth/decorators";
import { AuditInterceptor } from "../../crud/audit.interceptor";
import { PermissionGuard } from "../../rbac/permission.guard";
import { BranchScopeGuard } from "../../rbac/branch-scope.guard";
import { PaginationQueryDto } from "../../crud/dto";
import { TransferOrderService } from "./transfer-order.service";

class TransferOrderLineDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  @Min(0.001)
  requestedQty: number;

  @IsOptional()
  @IsUUID()
  sourceStorageId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

class ImportTransferOrderLineDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  locationId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

class ImportTransferOrderDto {
  /** Per-line received Kho/Vị trí from the goods-receipt form. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTransferOrderLineDto)
  lines?: ImportTransferOrderLineDto[];

  /** Kho nhận — fallback destination warehouse when `lines` is omitted. */
  @IsOptional()
  @IsUUID()
  destinationStorageId?: string;

  /**
   * Đối tượng carried onto the spawned receipt. Routed through the goods-receipt
   * counterparty resolver: supplier → provider_id, customer/employee →
   * counterparty columns only. Sending a bare providerId (legacy) bypasses
   * validation and can violate the provider FK, so prefer these two fields.
   */
  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  /** Người giao (free-text deliverer name). */
  @IsOptional()
  @IsString()
  deliverer?: string;

  /** Tham chiếu — FE-supplied reference codes. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  /** User-entered receive date+time (ISO). */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

class ExportTransferOrderLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  itemId: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  locationId: string;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

class ExportTransferOrderDto {
  @ApiPropertyOptional({ type: [ExportTransferOrderLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExportTransferOrderLineDto)
  lines?: ExportTransferOrderLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  /** Đối tượng (counterparty provider) selected on the goods-issue form. */
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  /** Đối tượng kind selected on the goods-issue form. */
  @ApiPropertyOptional({ enum: DocCounterpartyKind })
  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  /** Id of the provider / customer / employee, per counterpartyKind. */
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  /** Người giao (free-text deliverer name). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliverer?: string;

  /** Tham chiếu — FE-supplied reference codes. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  /** User-entered issue date+time (ISO). */
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

class CreateAndExportTransferOrderDto extends ExportTransferOrderDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  locationId: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  targetBranchId: string;

  @ApiProperty({ type: [ExportTransferOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExportTransferOrderLineDto)
  declare lines: ExportTransferOrderLineDto[];
}

class IssuableTransferOrderQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

class ImportableTransferOrderQueryDto extends IssuableTransferOrderQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeCompleted?: boolean;
}

class CreateTransferOrderDto {
  @IsString()
  sourceBranchId: string;

  @IsString()
  destinationBranchId: string;

  @IsOptional()
  @IsUUID()
  sourceStorageId?: string;

  @IsOptional()
  @IsUUID()
  destinationStorageId?: string;

  @IsOptional()
  @IsDateString()
  requestedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferOrderLineDto)
  lines: TransferOrderLineDto[];
}

class UpdateTransferOrderDto {
  @IsOptional()
  @IsEnum(TransferOrderStatus)
  status?: TransferOrderStatus;

  @IsOptional()
  @IsString()
  sourceBranchId?: string;

  @IsOptional()
  @IsString()
  destinationBranchId?: string;

  @IsOptional()
  @IsUUID()
  sourceStorageId?: string;

  @IsOptional()
  @IsUUID()
  destinationStorageId?: string;

  @IsOptional()
  @IsDateString()
  requestedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferOrderLineDto)
  lines?: TransferOrderLineDto[];
}

class TransferOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TransferOrderStatus)
  status?: TransferOrderStatus;
}

@Controller("inventory/transfer-orders")
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class TransferOrderController {
  constructor(private readonly service: TransferOrderService) {}

  @Post()
  @RequirePermission("inventory.transfer.create")
  @RequireBranchScope()
  create(@Body() dto: CreateTransferOrderDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Post("direct-export")
  @RequirePermission("inventory.transfer.create")
  @RequireBranchScope()
  createAndConfirmExport(
    @Body() dto: CreateAndExportTransferOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createAndConfirmExport(dto, actor);
  }

  @Get()
  @RequirePermission("inventory.transfer.read")
  list(@Query() query: TransferOrderQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      status: query.status,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
    });
  }

  @Get("issuable")
  @RequirePermission("inventory.transfer.read")
  listIssuable(
    @Query() query: IssuableTransferOrderQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listIssuable({ from: query.from, to: query.to }, actor);
  }

  @Get("importable")
  @RequirePermission("inventory.transfer.read")
  listImportable(
    @Query() query: ImportableTransferOrderQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listImportable(
      {
        from: query.from,
        to: query.to,
        includeCompleted: query.includeCompleted,
      },
      actor,
    );
  }

  @Get("by-code/:code")
  @RequirePermission("inventory.transfer.read")
  getByCode(@Param("code") code: string, @Actor() actor: ActorContext) {
    return this.service.getByCode(code, actor);
  }

  @Get(":id")
  @RequirePermission("inventory.transfer.read")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor);
  }

  @Get(":id/export-goods-issue")
  @RequirePermission("inventory.transfer.read")
  getExportGoodsIssue(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getExportGoodsIssue(id, actor);
  }

  @Patch(":id")
  @RequirePermission("inventory.transfer.create")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Post(":id/export")
  @RequirePermission("inventory.transfer.export")
  @RequireBranchScope()
  confirmExport(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ExportTransferOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.confirmExport(id, actor, dto);
  }

  @Post(":id/import")
  @RequirePermission("inventory.transfer.import")
  @RequireBranchScope()
  confirmImport(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ImportTransferOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.confirmImport(id, actor, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("inventory.transfer.cancel")
  async cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.service.cancel(id, actor);
  }
}
