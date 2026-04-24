import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { RequireBranchScope } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import { BranchScopeGuard } from '../rbac/branch-scope.guard';
import { AuditInterceptor } from '../crud/audit.interceptor';
import { PaginationQueryDto, FilterQueryDto } from '../crud/dto';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, UpdateCustomerDto, MergeCustomerDto } from './dto';

@Controller('customers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @RequirePermission('customer.write')
  create(
    @Body() dto: CreateCustomerDto,
    @Actor() actor: ActorContext,
  ) {
    return this.customerService.create(dto, actor);
  }

  @Get()
  @RequirePermission('customer.read')
  list(
    @Query() query: PaginationQueryDto,
    @Query('filters') filtersRaw: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    const filters = filtersRaw ? this.parseFilters(filtersRaw) : {};
    return this.customerService.list(query, filters, actor);
  }

  @Get(':id')
  @RequirePermission('customer.read')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.customerService.findByIdWithMergeCheck(id, actor);
  }

  @Patch(':id')
  @RequirePermission('customer.write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @Actor() actor: ActorContext,
  ) {
    return this.customerService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('customer.write')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.customerService.remove(id, actor);
  }

  @Post(':id/merge')
  @RequirePermission('customer.merge')
  merge(
    @Param('id', ParseUUIDPipe) sourceId: string,
    @Body() dto: MergeCustomerDto,
    @Actor() actor: ActorContext,
  ) {
    return this.customerService.merge(sourceId, dto.targetCustomerId, actor);
  }

  private parseFilters(raw: string): Record<string, any> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
