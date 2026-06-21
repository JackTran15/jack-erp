import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderEntity } from '../inventory/location/provider.entity';
import { CustomerEntity } from '../customer/customer.entity';
import { UserEntity } from '../auth/user.entity';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { CounterpartyController } from './counterparty.controller';
import { SearchCounterpartiesHandler } from './queries/search-counterparties.handler';

/**
 * Read-only cross-cutting lookup over the three "đối tượng" sources (suppliers,
 * customers, employees). Owns no entity — only a unified CQRS search query.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProviderEntity,
      CustomerEntity,
      UserEntity,
      EmployeeProfileEntity,
    ]),
    CqrsModule,
  ],
  controllers: [CounterpartyController],
  providers: [SearchCounterpartiesHandler],
})
export class CounterpartyModule {}
