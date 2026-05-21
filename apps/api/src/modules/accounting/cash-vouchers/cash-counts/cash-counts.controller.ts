import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { CashCountsService } from './cash-counts.service';
import { CreateCashCountDto } from './dto/create-cash-count.dto';
import { UpdateCashCountDto } from './dto/update-cash-count.dto';
import { QueryCashCountDto } from './dto/query-cash-count.dto';

@Controller('cash-counts')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashCountsController {
  constructor(private readonly service: CashCountsService) {}

  @Post()
  @RequirePermission('accounting.cash_count.create')
  create(@Body() dto: CreateCashCountDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('accounting.cash_count.read')
  list(@Query() query: QueryCashCountDto, @Actor() actor: ActorContext) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.cash_count.read')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor);
  }

  @Patch(':id')
  @RequirePermission('accounting.cash_count.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashCountDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Post(':id/post')
  @RequirePermission('accounting.cash_count.post')
  post(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.post(id, actor);
  }
}
