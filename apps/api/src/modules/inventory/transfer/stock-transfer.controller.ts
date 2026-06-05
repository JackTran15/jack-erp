import {
  Controller,
  Get,
  Post,
  Patch,
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
import { TransferStatus } from '@erp/shared-interfaces';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockTransferService } from './stock-transfer.service';
import { CreateIntraWarehouseTransferDto } from './create-intra-warehouse-transfer.dto';

class TransferLineDto {
  @IsUUID()
  itemId: string;

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
  @IsString()
  notes?: string;
}

class CreateTransferDto {
  @IsUUID()
  sourceLocationId: string;

  @IsUUID()
  destinationLocationId: string;

  @IsUUID()
  sourceBranchId: string;

  @IsUUID()
  destinationBranchId: string;

  @IsOptional()
  @IsString()
  notes?: string;

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
    return this.service.createAndPost(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('inventory.transfer.create')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
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
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor.organizationId);
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
