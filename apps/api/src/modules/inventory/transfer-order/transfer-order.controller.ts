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
} from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransferOrderStatus } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PaginationQueryDto } from '../../crud/dto';
import { TransferOrderService } from './transfer-order.service';

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

class ImportTransferOrderDto {
  @IsOptional()
  @IsUUID()
  destinationStorageId?: string;
}

class ExportTransferOrderLineDto {
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
  notes?: string;
}

class ExportTransferOrderDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExportTransferOrderLineDto)
  lines?: ExportTransferOrderLineDto[];

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class IssuableTransferOrderQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
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

@Controller('inventory/transfer-orders')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class TransferOrderController {
  constructor(private readonly service: TransferOrderService) {}

  @Post()
  @RequirePermission('inventory.transfer.create')
  @RequireBranchScope()
  create(@Body() dto: CreateTransferOrderDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('inventory.transfer.read')
  list(@Query() query: TransferOrderQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      status: query.status,
      organizationId: actor.organizationId,
    });
  }

  @Get('issuable')
  @RequirePermission('inventory.transfer.read')
  listIssuable(
    @Query() query: IssuableTransferOrderQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listIssuable(
      { from: query.from, to: query.to },
      actor,
    );
  }

  @Get('by-code/:code')
  @RequirePermission('inventory.transfer.read')
  getByCode(@Param('code') code: string, @Actor() actor: ActorContext) {
    return this.service.getByCode(code, actor.organizationId);
  }

  @Get(':id')
  @RequirePermission('inventory.transfer.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor.organizationId);
  }

  @Patch(':id')
  @RequirePermission('inventory.transfer.create')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Post(':id/export')
  @RequirePermission('inventory.transfer.export')
  @RequireBranchScope()
  confirmExport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExportTransferOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.confirmExport(id, actor, dto);
  }

  @Post(':id/import')
  @RequirePermission('inventory.transfer.import')
  @RequireBranchScope()
  confirmImport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportTransferOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.confirmImport(id, actor, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('inventory.transfer.cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.service.cancel(id, actor);
  }
}
