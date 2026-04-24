import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../crud/entity-registry.service';
import { CustomerEntity } from './customer.entity';
import {
  CustomerService,
  CUSTOMER_SERVICE_TOKEN,
  CUSTOMER_ENTITY_CONFIG,
} from './customer.service';
import { CustomerController } from './customer.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity])],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    { provide: CUSTOMER_SERVICE_TOKEN, useExisting: CustomerService },
  ],
  exports: [CustomerService],
})
export class CustomerModule implements OnModuleInit {
  constructor(
    private readonly entityRegistry: EntityRegistryService,
  ) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      CUSTOMER_ENTITY_CONFIG,
      CUSTOMER_SERVICE_TOKEN,
    );
  }
}
