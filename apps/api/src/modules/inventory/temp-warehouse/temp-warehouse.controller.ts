import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { TempWarehouseService } from './temp-warehouse.service';
import { AddTempWarehouseLineDto } from './dto/add-line.dto';
import { UpdateTempWarehouseLineDto } from './dto/update-line.dto';
import { ListTempWarehouseLinesQueryDto } from './dto/list-lines.query';
import { CloseTempWarehouseSessionDto } from './dto/close-session.dto';

@ApiTags('Inventory · Temp Warehouse')
@ApiHeader({
  name: 'X-Idempotency-Key',
  required: false,
  description:
    'Idempotency key — same key + same body within 24h replays the original response without creating duplicates',
})
@Controller('inventory/temp-warehouse')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class TempWarehouseController {
  constructor(private readonly service: TempWarehouseService) {}

  @Get('sessions/active')
  @ApiOperation({ summary: 'Get the ACTIVE session for a branch (404 if none)' })
  @RequirePermission('inventory.temp-warehouse.read')
  async getActiveSession(
    @Query('branchId', ParseUUIDPipe) branchId: string,
    @Actor() actor: ActorContext,
  ) {
    const session = await this.service.getActiveSession(branchId, actor);
    if (!session) {
      throw new NotFoundException({
        code: 'TEMP_WAREHOUSE_NO_ACTIVE_SESSION',
        message: `Branch ${branchId} has no ACTIVE temp warehouse session`,
      });
    }
    return session;
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get one session by id (including CLOSED) with its lines' })
  @RequirePermission('inventory.temp-warehouse.read')
  getSessionById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getSessionById(id, actor);
  }

  @Post('lines')
  @ApiOperation({ summary: 'Add a line; auto-opens an ACTIVE session if none exists' })
  @RequirePermission('inventory.temp-warehouse.write')
  addLine(
    @Body() dto: AddTempWarehouseLineDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.addLine(dto, actor);
  }

  @Patch('lines/:id')
  @ApiOperation({ summary: 'Update a line by soft-deleting it and creating a new one (idempotent)' })
  @RequirePermission('inventory.temp-warehouse.write')
  updateLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTempWarehouseLineDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateLine(id, dto, actor);
  }

  @Delete('lines/:id')
  @ApiOperation({ summary: 'Soft-delete a line (status=DELETED); idempotent' })
  @RequirePermission('inventory.temp-warehouse.write')
  deleteLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.deleteLine(id, actor);
  }

  @Get('lines')
  @ApiOperation({
    summary: 'List lines in raw mode (default) or aggregated net view (hideOffsetting=true)',
  })
  @RequirePermission('inventory.temp-warehouse.read')
  listLines(
    @Query() query: ListTempWarehouseLinesQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listLines(query, actor);
  }

  @Post('sessions/:id/close')
  @ApiOperation({
    summary:
      'Close a session with one of three modes: NET_OFFSET (auto-balance), CREATE_TRANSFERS (publish events to create stock transfers), or NONE',
  })
  @RequirePermission('inventory.temp-warehouse.close')
  closeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseTempWarehouseSessionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.closeSession(id, dto, actor);
  }
}
