import {
  Controller,
  Get,
  Post,
  Patch,
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
import { PaginationQueryDto, FilterQueryDto } from '../../crud/dto';
import { CoaService } from './coa.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

@Controller('accounts')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CoaController {
  constructor(private readonly coaService: CoaService) {}

  @Post()
  @RequirePermission('accounting.journal.post')
  create(
    @Body() dto: CreateAccountDto,
    @Actor() actor: ActorContext,
  ) {
    return this.coaService.create(dto, actor);
  }

  @Get()
  @RequirePermission('accounting.journal.post')
  list(
    @Query() query: PaginationQueryDto,
    @Query('filters') filtersRaw: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    const filters = filtersRaw ? this.parseFilters(filtersRaw) : {};
    return this.coaService.list(query, filters, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.journal.post')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.coaService.getById(id, actor);
  }

  @Patch(':id')
  @RequirePermission('accounting.journal.post')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @Actor() actor: ActorContext,
  ) {
    return this.coaService.update(id, dto, actor);
  }

  private parseFilters(raw: string): Record<string, any> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
