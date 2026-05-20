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
  IsArray,
  IsDateString,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { StockTakeStatus } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PaginationQueryDto } from '../../crud/dto';
import { StockTakeService } from './stock-take.service';

class CreateStockTakeLineDto {
  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  countedQty?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

class CreateStockTakeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  storageId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiProperty({ required: false, description: 'Kiểm kê đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @ApiProperty({ required: false, description: 'Mục đích kiểm kê' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, description: 'Kết luận sau kiểm kê' })
  @IsOptional()
  @IsString()
  conclusion?: string;

  @ApiProperty({ required: false, description: 'Ngày + giờ kiểm kê thực tế (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  countedAt?: string;

  @ApiProperty({ required: false, type: [CreateStockTakeLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockTakeLineDto)
  lines?: CreateStockTakeLineDto[];
}

class UpdateStockTakeHeaderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, description: 'Kết luận sau kiểm kê' })
  @IsOptional()
  @IsString()
  conclusion?: string;

  @ApiProperty({ required: false, description: 'Ngày + giờ kiểm kê thực tế (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  countedAt?: string;
}

class AddStockTakeLineDto {
  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

class UpdateLineCountDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  countedQty?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ required: false, description: 'Nguyên nhân chênh lệch' })
  @IsOptional()
  @IsString()
  reason?: string;
}

class StockTakeQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false, enum: StockTakeStatus })
  @IsOptional()
  @IsEnum(StockTakeStatus)
  status?: StockTakeStatus;

  @ApiProperty({ required: false, description: 'Lọc createdAt >= (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({ required: false, description: 'Lọc createdAt <= (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

@Controller('inventory/stock-takes')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockTakeController {
  constructor(private readonly service: StockTakeService) {}

  @Post()
  @RequirePermission('inventory.adjustment.create')
  @RequireBranchScope()
  create(@Body() dto: CreateStockTakeDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('inventory.read')
  list(@Query() query: StockTakeQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      status: query.status,
      fromDate: query.fromDate,
      toDate: query.toDate,
      organizationId: actor.organizationId,
    });
  }

  @Get(':id')
  @RequirePermission('inventory.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor.organizationId);
  }

  @Patch(':id')
  @RequirePermission('inventory.adjustment.create')
  @RequireBranchScope()
  updateHeader(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockTakeHeaderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateHeader(id, dto, actor);
  }

  @Post(':id/lines')
  @RequirePermission('inventory.adjustment.create')
  @RequireBranchScope()
  addLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStockTakeLineDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.addLine(id, dto, actor);
  }

  @Delete(':id/lines/:lineId')
  @HttpCode(204)
  @RequirePermission('inventory.adjustment.create')
  @RequireBranchScope()
  async removeLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.service.removeLine(id, lineId, actor);
  }

  @Patch(':id/lines/:lineId')
  @RequirePermission('inventory.adjustment.create')
  @RequireBranchScope()
  updateLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateLineCountDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateLineCount(id, lineId, dto, actor);
  }

  @Post(':id/process')
  @RequirePermission('inventory.adjustment.approve')
  @RequireBranchScope()
  process(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.process(id, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('inventory.adjustment.create')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.service.cancel(id, actor);
  }
}
