import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { PurchaseOrderStatus } from '@erp/shared-interfaces';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseOrderService } from './purchase-order.service';

class PurchaseOrderLineDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  @Min(0.01)
  orderedQuantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreatePurchaseOrderDto {
  @IsUUID()
  providerId: string;

  @IsUUID()
  locationId: string;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines: PurchaseOrderLineDto[];
}

class ReceiveLineDto {
  @IsUUID()
  lineId: string;

  @IsNumber()
  @Min(0.01)
  receivedQuantity: number;
}

class ReceiveGoodsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];
}

class PurchaseOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsString()
  branchId?: string;
}

@Controller('inventory/purchase-orders')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class PurchaseOrderController {
  constructor(private readonly service: PurchaseOrderService) {}

  @Post()
  @RequirePermission('inventory.purchase-order.create')
  create(@Body() dto: CreatePurchaseOrderDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('inventory.purchase-order.read')
  list(@Query() query: PurchaseOrderQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({ ...query, organizationId: actor.organizationId });
  }

  @Get(':id')
  @RequirePermission('inventory.purchase-order.read')
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor.organizationId);
  }

  @Post(':id/approve')
  @RequirePermission('inventory.purchase-order.approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.approve(id, actor);
  }

  @Post(':id/receive')
  @RequirePermission('inventory.purchase-order.receive')
  receiveGoods(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveGoodsDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.receiveGoods(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.purchase-order.cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.cancel(id, actor);
  }
}
