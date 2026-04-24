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
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockAdjustmentService } from './stock-adjustment.service';
import { AdjustmentStatus } from './stock-adjustment.entity';

class AdjustmentLineDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreateAdjustmentDto {
  @IsUUID()
  locationId: string;

  @IsUUID()
  branchId: string;

  @IsString()
  reasonCode: string;

  @IsOptional()
  @IsString()
  reasonDescription?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines: AdjustmentLineDto[];
}

class AdjustmentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AdjustmentStatus)
  status?: AdjustmentStatus;

  @IsOptional()
  @IsString()
  branchId?: string;
}

@Controller('inventory/stock/adjustments')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockAdjustmentController {
  constructor(private readonly service: StockAdjustmentService) {}

  @Post()
  @RequirePermission('inventory.adjustment.create')
  create(@Body() dto: CreateAdjustmentDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('inventory.adjustment.read')
  list(@Query() query: AdjustmentQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({
      ...query,
      organizationId: actor.organizationId,
    });
  }

  @Get(':id')
  @RequirePermission('inventory.adjustment.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor.organizationId);
  }

  @Post(':id/submit')
  @RequirePermission('inventory.adjustment.submit')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.submit(id, actor);
  }

  @Post(':id/approve')
  @RequirePermission('inventory.adjustment.approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.approve(id, actor);
  }

  @Post(':id/post')
  @RequirePermission('inventory.adjustment.post')
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.post(id, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.adjustment.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.cancel(id, actor);
  }
}
