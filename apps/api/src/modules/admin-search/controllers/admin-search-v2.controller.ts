import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { CustomerSearchV2Dto } from '../dto/customer-search-v2.dto';
import { ProviderSearchV2Dto } from '../dto/provider-search-v2.dto';
import { JobPositionSearchV2Dto } from '../dto/job-position-search-v2.dto';
import { AccountSearchV2Dto } from '../dto/account-search-v2.dto';
import { EmployeeSearchV2Dto } from '../dto/employee-search-v2.dto';
import { ItemCategorySearchV2Dto } from '../dto/item-category-search-v2.dto';
import { SearchCustomersV2Query } from '../queries/search-customers-v2.query';
import { SearchProvidersV2Query } from '../queries/search-providers-v2.query';
import { SearchJobPositionsV2Query } from '../queries/search-job-positions-v2.query';
import { SearchAccountsV2Query } from '../queries/search-accounts-v2.query';
import { SearchEmployeesV2Query } from '../queries/search-employees-v2.query';
import { SearchItemCategoriesV2Query } from '../queries/search-item-categories-v2.query';

/**
 * Single versioned controller hosting server-side CQRS search for the backoffice
 * admin list surfaces. Each route is a thin dispatcher to a QueryBus handler and
 * resolves to `POST /v2/<entity>/search` via the per-method @Version('2').
 */
@Controller()
@UseGuards(PermissionGuard)
export class AdminSearchV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('customers/search')
  @Version('2')
  @RequirePermission('customer.read')
  searchCustomers(
    @Body() dto: CustomerSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchCustomersV2Query(dto, actor));
  }

  @Post('inventory-providers/search')
  @Version('2')
  @RequirePermission('inventory.read')
  searchProviders(
    @Body() dto: ProviderSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchProvidersV2Query(dto, actor));
  }

  @Post('job-positions/search')
  @Version('2')
  @RequirePermission('iam.user.read')
  searchJobPositions(
    @Body() dto: JobPositionSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchJobPositionsV2Query(dto, actor));
  }

  @Post('accounts/search')
  @Version('2')
  @RequirePermission('accounting.journal.post')
  searchAccounts(
    @Body() dto: AccountSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchAccountsV2Query(dto, actor));
  }

  @Post('employees/search')
  @Version('2')
  @RequirePermission('iam.user.read')
  searchEmployees(
    @Body() dto: EmployeeSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchEmployeesV2Query(dto, actor));
  }

  @Post('inventory-item-categories/search')
  @Version('2')
  @RequirePermission('inventory.read')
  searchItemCategories(
    @Body() dto: ItemCategorySearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchItemCategoriesV2Query(dto, actor));
  }
}
