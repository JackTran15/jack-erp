import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../auth/decorators';
import { SalesHierarchyService } from './sales-hierarchy.service';
import { AssignSalesPersonDto, UnassignSalesPersonDto } from './dto';

@Controller('branches')
export class SalesHierarchyController {
  constructor(private readonly service: SalesHierarchyService) {}

  @Get(':id/salesmen')
  @RequirePermission('sales-hierarchy.read')
  @RequireBranchScope()
  listSalesmen(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listSalesmen(branchId, actor);
  }

  @Post(':id/salesmen/assign')
  @RequirePermission('sales-hierarchy.manage')
  @RequireBranchScope()
  assignSalesman(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Body() dto: AssignSalesPersonDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.assignSalesman(branchId, dto.userId, actor);
  }

  @Post(':id/salesmen/unassign')
  @RequirePermission('sales-hierarchy.manage')
  @RequireBranchScope()
  unassignSalesman(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Body() dto: UnassignSalesPersonDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.unassignSalesman(branchId, dto.userId, actor);
  }

  @Get(':id/sales-managers')
  @RequirePermission('sales-hierarchy.read')
  @RequireBranchScope()
  listSalesManagers(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listSalesManagers(branchId, actor);
  }

  @Post(':id/sales-managers/assign')
  @RequirePermission('sales-hierarchy.manage')
  @RequireBranchScope()
  assignSalesManager(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Body() dto: AssignSalesPersonDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.assignSalesManager(branchId, dto.userId, actor);
  }

  @Post(':id/sales-managers/unassign')
  @RequirePermission('sales-hierarchy.manage')
  @RequireBranchScope()
  unassignSalesManager(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Body() dto: UnassignSalesPersonDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.unassignSalesManager(branchId, dto.userId, actor);
  }
}
