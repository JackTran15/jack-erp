import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from '../customer/customer.entity';
import { ProviderEntity } from '../inventory/location/provider.entity';
import { ItemCategoryEntity } from '../inventory/location/item-category.entity';
import { JobPositionEntity } from '../hr/job-position/job-position.entity';
import { AccountEntity } from '../accounting/coa/account.entity';
import { UserEntity } from '../auth/user.entity';
import { AdminSearchV2Controller } from './controllers/admin-search-v2.controller';
import { SearchCustomersV2Handler } from './queries/search-customers-v2.handler';
import { SearchProvidersV2Handler } from './queries/search-providers-v2.handler';
import { SearchJobPositionsV2Handler } from './queries/search-job-positions-v2.handler';
import { SearchAccountsV2Handler } from './queries/search-accounts-v2.handler';
import { SearchEmployeesV2Handler } from './queries/search-employees-v2.handler';
import { SearchItemCategoriesV2Handler } from './queries/search-item-categories-v2.handler';

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
      JobPositionEntity,
      AccountEntity,
      UserEntity,
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
  ],
})
export class AdminSearchModule {}
