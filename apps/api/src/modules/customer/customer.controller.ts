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
  ParseIntPipe,
  DefaultValuePipe,
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
import { CustomerGroupService } from './customer-group.service';
import { MembershipCardService } from './services/membership-card.service';
import { CreateCustomerDto, UpdateCustomerDto, MergeCustomerDto } from './dto';
import { CreateCustomerGroupDto } from './dto/create-customer-group.dto';
import { IssueMembershipCardDto } from './dto/issue-membership-card.dto';
import { AdjustPointsDto } from './dto/adjust-points.dto';

@Controller('customers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly customerGroupService: CustomerGroupService,
    private readonly membershipCardService: MembershipCardService,
  ) {}

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

  // ---------------------------------------------------------------------------
  // Customer group endpoints (must be before :id routes)
  // ---------------------------------------------------------------------------

  @Post('groups')
  @RequirePermission('customer.write')
  createGroup(
    @Body() dto: CreateCustomerGroupDto,
    @Actor() actor: ActorContext,
  ) {
    console.log('createGroup', dto, actor);
    return this.customerGroupService.create(dto, actor);
  }

  @Get('groups')
  @RequirePermission('customer.read')
  listGroups(@Actor() actor: ActorContext) {
    console.log('listGroups', actor);
    return this.customerGroupService.findAll(actor);
  }

  @Get('groups/:id')
  @RequirePermission('customer.read')
  getGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.customerGroupService.findOne(id, actor);
  }

  @Patch('groups/:id')
  @RequirePermission('customer.write')
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateCustomerGroupDto>,
    @Actor() actor: ActorContext,
  ) {
    return this.customerGroupService.update(id, dto, actor);
  }

  @Delete('groups/:id')
  @RequirePermission('customer.write')
  removeGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.customerGroupService.remove(id, actor);
  }

  // ---------------------------------------------------------------------------
  // Membership card endpoints (must be before :id routes)
  // ---------------------------------------------------------------------------

  @Get('membership-cards/:cardId/points')
  @RequirePermission('customer.read')
  getPointHistory(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Actor() actor: ActorContext,
  ) {
    return this.membershipCardService.getPointHistory(cardId, actor, page, limit);
  }

  @Post('membership-cards/:cardId/points')
  @RequirePermission('customer.write')
  adjustPoints(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: AdjustPointsDto,
    @Actor() actor: ActorContext,
  ) {
    return this.membershipCardService.adjustPoints(cardId, dto, actor);
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

  @Post(':id/membership-card')
  @RequirePermission('customer.write')
  issueCard(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Body() dto: IssueMembershipCardDto,
    @Actor() actor: ActorContext,
  ) {
    return this.membershipCardService.issueCard(customerId, dto, actor);
  }

  @Get(':id/membership-card')
  @RequirePermission('customer.read')
  getCard(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.membershipCardService.getCard(customerId, actor);
  }

  @Patch(':id/membership-card')
  @RequirePermission('customer.write')
  updateCard(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Body() dto: Partial<IssueMembershipCardDto>,
    @Actor() actor: ActorContext,
  ) {
    return this.membershipCardService.updateCard(customerId, dto, actor);
  }

  private parseFilters(raw: string): Record<string, any> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
