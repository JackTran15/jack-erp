import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from '../customer/customer.entity';
import { ProviderEntity } from '../inventory/location/provider.entity';
import { ItemCategoryEntity } from '../inventory/location/item-category.entity';
import { StorageEntity } from '../inventory/location/storage.entity';
import { LocationEntity } from '../inventory/location/location.entity';
import { JobPositionEntity } from '../hr/job-position/job-position.entity';
import { AccountEntity } from '../accounting/coa/account.entity';
import { UserEntity } from '../auth/user.entity';
import { RoleEntity } from '../auth/role.entity';
import { BranchEntity } from '../branch/branch.entity';
import { ExpenseEntity } from '../accounting/expenses/expense.entity';
import { PayableEntity } from '../accounting/payables/payable.entity';
import { ReceivableEntity } from '../accounting/receivables/receivable.entity';
import { SupplierGroupEntity } from '../inventory/location/supplier-group.entity';
import { UnitOfMeasureEntity } from '../inventory/location/unit-of-measure.entity';
import { StockBalanceEntity } from '../inventory/ledger/stock-balance.entity';
import { AdminSearchV2Controller } from './controllers/admin-search-v2.controller';
import { SearchCustomersV2Handler } from './queries/search-customers-v2.handler';
import { SearchProvidersV2Handler } from './queries/search-providers-v2.handler';
import { SearchJobPositionsV2Handler } from './queries/search-job-positions-v2.handler';
import { SearchAccountsV2Handler } from './queries/search-accounts-v2.handler';
import { SearchEmployeesV2Handler } from './queries/search-employees-v2.handler';
import { SearchItemCategoriesV2Handler } from './queries/search-item-categories-v2.handler';
import { SearchStoragesV2Handler } from './queries/search-storages-v2.handler';
import { SearchLocationsV2Handler } from './queries/search-locations-v2.handler';
import { SearchBranchesV2Handler } from './queries/search-branches-v2.handler';
import { SearchExpensesV2Handler } from './queries/search-expenses-v2.handler';
import { SearchInventoryItemUnitsV2Handler } from './queries/search-inventory-item-units-v2.handler';
import { SearchInventoryStockBalancesV2Handler } from './queries/search-inventory-stock-balances-v2.handler';
import { SearchPayablesV2Handler } from './queries/search-payables-v2.handler';
import { SearchProviderGroupsV2Handler } from './queries/search-provider-groups-v2.handler';
import { SearchReceivablesV2Handler } from './queries/search-receivables-v2.handler';
import { SearchRolesV2Handler } from './queries/search-roles-v2.handler';

/**
 * Hosts the versioned `POST /v2/<entity>/search` endpoints for backoffice admin
 * lists. Read-only: query handlers scope by organizationId and apply FilterBuilder.
 * UsersService (employees mapper) is provided globally by the @Global RbacModule.
 */
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      CustomerEntity,
      ProviderEntity,
      ItemCategoryEntity,
      StorageEntity,
      LocationEntity,
      JobPositionEntity,
      AccountEntity,
      UserEntity,
      RoleEntity,
      BranchEntity,
      ExpenseEntity,
      PayableEntity,
      ReceivableEntity,
      SupplierGroupEntity,
      UnitOfMeasureEntity,
      StockBalanceEntity,
    ]),
  ],
  controllers: [AdminSearchV2Controller],
  providers: [
    SearchCustomersV2Handler,
    SearchProvidersV2Handler,
    SearchJobPositionsV2Handler,
    SearchAccountsV2Handler,
    SearchEmployeesV2Handler,
    SearchItemCategoriesV2Handler,
    SearchStoragesV2Handler,
    SearchLocationsV2Handler,
    SearchBranchesV2Handler,
    SearchExpensesV2Handler,
    SearchInventoryItemUnitsV2Handler,
    SearchInventoryStockBalancesV2Handler,
    SearchPayablesV2Handler,
    SearchProviderGroupsV2Handler,
    SearchReceivablesV2Handler,
    SearchRolesV2Handler,
  ],
})
export class AdminSearchModule {}
