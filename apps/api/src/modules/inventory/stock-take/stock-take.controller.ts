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
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { StockTakeStatus } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PaginationQueryDto } from '../../crud/dto';
import { StockTakeService } from './stock-take.service';

class CreateStockTakeDto {
  @IsOptional()
  @IsUUID()
  storageId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateLineCountDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  countedQty: number | null;

  @IsOptional()
  @IsString()
  note?: string;
}

class StockTakeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(StockTakeStatus)
  status?: StockTakeStatus;
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

  @Post(':id/post')
  @RequirePermission('inventory.adjustment.approve')
  @RequireBranchScope()
  post(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.post(id, actor);
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
