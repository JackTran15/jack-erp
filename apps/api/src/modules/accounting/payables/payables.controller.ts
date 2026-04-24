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
import { PayablesService } from './payables.service';
import { CreatePayableDto, SettlePayableDto } from './dto';

@Controller('payables')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) {}

  @Post()
  @RequirePermission('accounting.payables.create')
  create(
    @Body() dto: CreatePayableDto,
    @Actor() actor: ActorContext,
  ) {
    return this.payablesService.create(dto, actor);
  }

  @Post(':id/post')
  @RequirePermission('accounting.payables.update')
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.payablesService.post(id, actor);
  }

  @Post(':id/settle')
  @RequirePermission('accounting.payables.update')
  settle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettlePayableDto,
    @Actor() actor: ActorContext,
  ) {
    return this.payablesService.settle(id, dto, actor);
  }

  @Post(':id/void')
  @RequirePermission('accounting.payables.update')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.payablesService.void(id, actor);
  }

  @Get()
  @RequirePermission('accounting.payables.read')
  list(
    @Query() query: PaginationQueryDto,
    @Query('filters') filtersRaw: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    const filters = filtersRaw ? this.parseFilters(filtersRaw) : {};
    return this.payablesService.list(query, filters, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.payables.read')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.payablesService.getById(id, actor);
  }

  private parseFilters(raw: string): Record<string, any> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
