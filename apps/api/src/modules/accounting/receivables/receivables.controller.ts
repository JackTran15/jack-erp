import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { ReceivablesService } from './receivables.service';
import {
  CreateReceivableDto,
  CollectReceivableDto,
  WriteOffReceivableDto,
} from './dto';

@Controller('receivables')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

  @Post()
  @RequirePermission('accounting.receivables.create')
  create(
    @Body() dto: CreateReceivableDto,
    @Actor() actor: ActorContext,
  ) {
    return this.receivablesService.create(dto, actor);
  }

  @Post(':id/post')
  @RequirePermission('accounting.receivables.update')
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.receivablesService.post(id, actor);
  }

  @Post(':id/collect')
  @RequirePermission('accounting.receivables.update')
  collect(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CollectReceivableDto,
    @Actor() actor: ActorContext,
  ) {
    return this.receivablesService.collect(id, dto, actor);
  }

  @Post(':id/write-off')
  @RequirePermission('accounting.receivables.write-off')
  writeOff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WriteOffReceivableDto,
    @Actor() actor: ActorContext,
  ) {
    return this.receivablesService.writeOff(id, dto, actor);
  }

  @Post(':id/void')
  @RequirePermission('accounting.receivables.update')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.receivablesService.void(id, actor);
  }

  @Get()
  @RequirePermission('accounting.receivables.read')
  list(
    @Query() query: PaginationQueryDto,
    @Query('filters') filtersRaw: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    const filters = filtersRaw ? this.parseFilters(filtersRaw) : {};
    return this.receivablesService.list(query, filters, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.receivables.read')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.receivablesService.getById(id, actor);
  }

  private parseFilters(raw: string): Record<string, any> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
