import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { TemporaryTransferStatus } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { TemporaryTransferService } from './temporary-transfer.service';
import { CreateTemporaryTransferDto } from './dto/create-temporary-transfer.dto';
import { ReturnTemporaryTransferDto } from './dto/return-temporary-transfer.dto';

class TemporaryTransferQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TemporaryTransferStatus)
  status?: TemporaryTransferStatus;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  carrierUserId?: string;
}

class OutstandingItemsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  carrierUserId?: string;
}

@ApiTags('Inventory · Temporary Transfers')
@Controller('inventory/temporary-transfers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class TemporaryTransferController {
  constructor(private readonly service: TemporaryTransferService) {}

  @Post()
  @RequireBranchScope()
  @RequirePermission('inventory.temporary-transfer.create')
  create(
    @Body() dto: CreateTemporaryTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('inventory.temporary-transfer.read')
  list(
    @Query() query: TemporaryTransferQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.list(query, actor);
  }

  @Get('outstanding-items')
  @RequirePermission('inventory.temporary-transfer.read')
  listOutstanding(
    @Query() query: OutstandingItemsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listOutstandingItems(query, actor);
  }

  @Get(':id')
  @RequirePermission('inventory.temporary-transfer.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor);
  }

  @Post(':id/return')
  @RequirePermission('inventory.temporary-transfer.return')
  returnLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnTemporaryTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.returnLines(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.temporary-transfer.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.cancel(id, actor);
  }
}
