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
import { GoodsIssuePurpose, GoodsIssueStatus } from '@erp/shared-interfaces';
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsIssueLineDto)
  lines: GoodsIssueLineDto[];
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
  @RequirePermission('inventory.write')
  create(@Body() dto: CreateGoodsIssueDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('inventory.read')
  list(@Query() query: GoodsIssueQueryDto, @Actor() actor: ActorContext) {
    return this.service.list({ ...query, organizationId: actor.organizationId });
  }

  @Get(':id')
  @RequirePermission('inventory.read')
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor.organizationId);
  }

  @Post(':id/approve')
  @RequirePermission('inventory.write')
  approve(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.approve(id, actor);
  }

  @Post(':id/post')
  @RequirePermission('inventory.write')
  post(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.post(id, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.write')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.cancel(id, actor);
  }
}
