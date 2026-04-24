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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto';

@Controller('expenses')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @RequirePermission('accounting.expenses.create')
  create(
    @Body() dto: CreateExpenseDto,
    @Actor() actor: ActorContext,
  ) {
    return this.expensesService.create(dto, actor);
  }

  @Post(':id/approve')
  @RequirePermission('accounting.expenses.update')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.expensesService.approve(id, actor);
  }

  @Post(':id/post')
  @RequirePermission('accounting.expenses.update')
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.expensesService.post(id, actor);
  }

  @Get()
  @RequirePermission('accounting.expenses.read')
  list(
    @Query() query: PaginationQueryDto,
    @Query('filters') filtersRaw: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    const filters = filtersRaw ? this.parseFilters(filtersRaw) : {};
    return this.expensesService.list(query, filters, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.expenses.read')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.expensesService.getById(id, actor);
  }

  private parseFilters(raw: string): Record<string, any> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
