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
import { StorageSearchV2Dto } from '../dto/storage-search-v2.dto';
import { LocationSearchV2Dto } from '../dto/location-search-v2.dto';
import { BranchSearchV2Dto } from '../dto/branch-search-v2.dto';
import { ExpenseSearchV2Dto } from '../dto/expense-search-v2.dto';
import { InventoryItemUnitSearchV2Dto } from '../dto/inventory-item-unit-search-v2.dto';
import { InventoryStockBalanceSearchV2Dto } from '../dto/inventory-stock-balance-search-v2.dto';
import { PayableSearchV2Dto } from '../dto/payable-search-v2.dto';
import { ProviderGroupSearchV2Dto } from '../dto/provider-group-search-v2.dto';
import { ReceivableSearchV2Dto } from '../dto/receivable-search-v2.dto';
import { RoleSearchV2Dto } from '../dto/role-search-v2.dto';
import { SearchCustomersV2Query } from '../queries/search-customers-v2.query';
import { SearchProvidersV2Query } from '../queries/search-providers-v2.query';
import { SearchJobPositionsV2Query } from '../queries/search-job-positions-v2.query';
import { SearchAccountsV2Query } from '../queries/search-accounts-v2.query';
import { SearchEmployeesV2Query } from '../queries/search-employees-v2.query';
import { SearchItemCategoriesV2Query } from '../queries/search-item-categories-v2.query';
import { SearchStoragesV2Query } from '../queries/search-storages-v2.query';
import { SearchLocationsV2Query } from '../queries/search-locations-v2.query';
import { SearchBranchesV2Query } from '../queries/search-branches-v2.query';
import { SearchExpensesV2Query } from '../queries/search-expenses-v2.query';
import { SearchInventoryItemUnitsV2Query } from '../queries/search-inventory-item-units-v2.query';
import { SearchInventoryStockBalancesV2Query } from '../queries/search-inventory-stock-balances-v2.query';
import { SearchPayablesV2Query } from '../queries/search-payables-v2.query';
import { SearchProviderGroupsV2Query } from '../queries/search-provider-groups-v2.query';
import { SearchReceivablesV2Query } from '../queries/search-receivables-v2.query';
import { SearchRolesV2Query } from '../queries/search-roles-v2.query';

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

  @Post('inventory-storages/search')
  @Version('2')
  @RequirePermission('inventory.read')
  searchStorages(
    @Body() dto: StorageSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchStoragesV2Query(dto, actor));
  }

  @Post('inventory-locations/search')
  @Version('2')
  @RequirePermission('inventory.read')
  searchLocations(
    @Body() dto: LocationSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchLocationsV2Query(dto, actor));
  }

  @Post('inventory-item-units/search')
  @Version('2')
  @RequirePermission('inventory.read')
  searchInventoryItemUnits(
    @Body() dto: InventoryItemUnitSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchInventoryItemUnitsV2Query(dto, actor));
  }

  @Post('inventory-stock-balances/search')
  @Version('2')
  @RequirePermission('inventory.read')
  searchInventoryStockBalances(
    @Body() dto: InventoryStockBalanceSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(
      new SearchInventoryStockBalancesV2Query(dto, actor),
    );
  }

  @Post('payables/search')
  @Version('2')
  @RequirePermission('accounting.payables.read')
  searchPayables(@Body() dto: PayableSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchPayablesV2Query(dto, actor));
  }

  @Post('receivables/search')
  @Version('2')
  @RequirePermission('accounting.receivables.read')
  searchReceivables(
    @Body() dto: ReceivableSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchReceivablesV2Query(dto, actor));
  }

  @Post('expenses/search')
  @Version('2')
  @RequirePermission('accounting.expenses.read')
  searchExpenses(@Body() dto: ExpenseSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchExpensesV2Query(dto, actor));
  }

  @Post('branches/search')
  @Version('2')
  @RequirePermission('branch.read')
  searchBranches(@Body() dto: BranchSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchBranchesV2Query(dto, actor));
  }

  @Post('provider-groups/search')
  @Version('2')
  @RequirePermission('inventory.read')
  searchProviderGroups(
    @Body() dto: ProviderGroupSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchProviderGroupsV2Query(dto, actor));
  }

  @Post('roles/search')
  @Version('2')
  @RequirePermission('iam.role.read')
  searchRoles(@Body() dto: RoleSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchRolesV2Query(dto, actor));
  }
}
