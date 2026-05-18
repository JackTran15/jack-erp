import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
  @IsString()
  note?: string;
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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferOrderLineDto)
  lines: TransferOrderLineDto[];
}

class TransferOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TransferOrderStatus)
  status?: TransferOrderStatus;
}

class MarkExecutedDto {
  @IsUUID()
  stockTransferId: string;
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

  @Get(':id')
  @RequirePermission('inventory.transfer.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor.organizationId);
  }

  @Post(':id/approve')
  @RequirePermission('inventory.transfer.approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.approve(id, actor);
  }

  @Post(':id/execute')
  @RequirePermission('inventory.transfer.create')
  @RequireBranchScope()
  markExecuted(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkExecutedDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.markExecuted(id, dto.stockTransferId, actor);
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
